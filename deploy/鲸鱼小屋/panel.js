(() => {
 'use strict';
 const $=id=>document.getElementById(id),content=$('content'),notice=$('notice');
 const furnitureGroups={
  comms:{label:'全息通讯视窗',floor:'1',pages:['overview','qq','proactive','expression']},
  computer:{label:'琉璃的电脑',floor:'1',pages:['memory','persona','relations']},
  workbench:{label:'工坊与舱室中枢',floor:'1',pages:['tools','decor','system','about']},
  enchant:{label:'附魔台',floor:'2',pages:['diary']},
  bed:{label:'床',floor:'2',pages:['night','dreams']}
 };
 const pageTargets={
  overview:['comms','overview'],qq:['comms','qq'],proactive:['comms','proactive'],expression:['comms','expression'],
  memory:['computer','memory'],persona:['computer','persona'],relations:['computer','relations'],
  tools:['workbench','tools'],decor:['workbench','decor'],system:['workbench','system'],about:['workbench','about'],
  night:['bed','night'],dreams:['bed','dreams'],diary:['enchant','read']
 };
 const roomView={floor:null,detail:false,preview:'auto',immersive:false};
 let roomRuntime=null,runtimeReceived=false,resolveRoomRuntime;
 const runtimeReady=new Promise(resolve=>{resolveRoomRuntime=resolve;setTimeout(resolve,1500);});
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='liuli-companion'||event.data.type!=='room-runtime'||runtimeReceived)return;runtimeReceived=true;roomRuntime=event.data.value;resolveRoomRuntime();});
 parent.postMessage({channel:'liuli-companion',type:'room-runtime-request'},'*');
 let lastSavedSig='',lastSavedAt=0;
 const stateSig=v=>{if(!v||!v.state)return '';const s=v.state;return [v.revision,v.preview,s.floor,s.residentLevel,s.currentMode,s.travelling,s.route?.kind,s.route?.floor,s.route?.target,v.life?.mode,v.life?.phase].join(':');};
 const saveRoomRuntime=(force=false)=>{const value=activeRoomScene?.getRoomRuntime?.();if(!value)return;const sig=stateSig(value),now=Date.now(),dirty=sig!==lastSavedSig,checkpoint=(now-lastSavedAt)>=12000;if(force||dirty||checkpoint){roomRuntime=value;lastSavedSig=sig;lastSavedAt=now;parent.postMessage({channel:'liuli-companion',type:'room-runtime-save',value},'*');}};
 window.addEventListener('pagehide',()=>saveRoomRuntime(true));
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)saveRoomRuntime(true);else if(roomRuntime)activeRoomScene?.restoreRoomRuntime?.(roomRuntime);});
 const stageNames={awake:'清醒',onset:'刚入睡',light:'浅睡',deep:'深睡',rem:'梦境时段'};
 const statusNames={queued:'等待中',running:'进行中',done:'已完成',failed:'失败',unknown:'结果待核对',active:'有效',archived:'已归档',conflict:'待核对'};
 let current='room',activePanelKey='room',revision=0,renderVersion=0,roomRevision=0,panelRevision=0,busy=false;
 let activeRoomScene=null,fittingScene=null,roomWorkspace=null,roomBookReader=null,roomArtAssets=null;
 let cachedRoomShell=null,cachedRoomResult=null,cachedRoomJson='',cachedRoomIdentity='',cachedRoomEnv='',currentRoomData=null,activeRoomRestoreGate=null,prefetchedRoom=null;
 let activeFurnitureButtons={},hudButtons=null,latestNight=null,latestJobs=[];
 const cachedViewNodes=new Map(),readCache=new Map(),inflightReads=new Map();
 const READ_CACHE_TTL=12000;
 const cloneData=typeof structuredClone==='function'?structuredClone:v=>JSON.parse(JSON.stringify(v));
 const invalidateReadCache=(dropViews=false)=>{readCache.clear();if(dropViews)cachedViewNodes.clear();};
 parent.postMessage({channel:'liuli-companion',type:'room-assets-request'},'*');
 setTimeout(()=>{if(!ROOM_ACTIONS.lifeV10)parent.postMessage({channel:'liuli-companion',type:'room-life-request'},'*');},60);
 setTimeout(()=>{if(!outfitRequest)requestOutfit();},180);
 let openRoomFurniture=null;
 const openFurnitureForPage=pageId=>{
  const target=pageTargets[pageId];
  if(!target)return;
  let attempts=0;
  const tryOpen=()=>{
   if(openRoomFurniture&&activeRoomScene){
    void openRoomFurniture(target[0],target[1]);
   }else if(attempts++<40){
    setTimeout(tryOpen,50);
   }
  };
  tryOpen();
 };
 const bookRequests=new Map();
 const requestBooks=(op,value)=>new Promise((resolve,reject)=>{const requestId=uid(),timer=setTimeout(()=>{bookRequests.delete(requestId);reject(Error('书架响应超时，请重试。'));},15000);bookRequests.set(requestId,{resolve,reject,timer});parent.postMessage({channel:'liuli-companion',type:'book-request',requestId,op,value},'*');});
 window.addEventListener('message',event=>{const d=event.data;if(event.source!==parent||d?.channel!=='liuli-companion'||d.type!=='book-response')return;const p=bookRequests.get(d.requestId);if(!p)return;bookRequests.delete(d.requestId);clearTimeout(p.timer);d.error?p.reject(Error(d.error)):p.resolve(d.value);});
 const workspaceStore={};
 const workspaceRequest=async(action,body,rev)=>{if(rev===undefined)return rpc(action,body,undefined,true);if(busy)throw Error("上一项操作还在处理");busy=true;try{const res=await rpc(action,body,rev,true);invalidateReadCache();return res;}finally{busy=false;}};
 let outfitAsset=null,outfitId='original',targetOutfitId='',loadingOutfitId=null,outfitRequest='',outfitLoading=false,outfitNotice='',updateWardrobe=()=>{},outfitTimer;
 const outfitAssetCache=new Map();
 if(typeof window!=='undefined'){window.outfitAssetCache=outfitAssetCache;}
 const pendingRequests=new Map();
 const prefetchedOutfits=new Set();
 const MAX_OUTFIT_CACHE=6;
 let prefetchTimer=null,prefetchTimeout=null,activePrefetchId=null;
 const prefetchQueue=[];

 function putOutfitCache(id,asset){
  if(!asset||id==='original')return;
  if(outfitAssetCache.has(id)){
   outfitAssetCache.delete(id);
  }else if(outfitAssetCache.size>=MAX_OUTFIT_CACHE){
   let evictKey=null;
   for(const key of outfitAssetCache.keys()){
    if(key!==outfitId){evictKey=key;break;}
   }
   if(!evictKey)evictKey=outfitAssetCache.keys().next().value;
   if(evictKey){
    const evicted=outfitAssetCache.get(evictKey);
    outfitAssetCache.delete(evictKey);
    if(evictKey!==outfitId&&typeof revokeWardrobeBlobUrls==='function')revokeWardrobeBlobUrls(evicted);
   }
  }
  outfitAssetCache.set(id,asset);
 }

 function pumpPrefetch(){
  if(activePrefetchId||outfitLoading||!prefetchQueue.length)return;
  const id=prefetchQueue.shift();
  if(!id||id==='original'||outfitAssetCache.has(id)||prefetchedOutfits.has(id)){pumpPrefetch();return;}
  prefetchedOutfits.add(id);activePrefetchId=id;
  const reqId=uid();
  pendingRequests.set(reqId,id);
  clearTimeout(prefetchTimeout);
  prefetchTimeout=setTimeout(()=>{if(activePrefetchId===id){pendingRequests.delete(reqId);prefetchedOutfits.delete(id);activePrefetchId=null;pumpPrefetch();}},20000);
  parent.postMessage({channel:'liuli-companion',type:'wardrobe-request',id,requestId:reqId},'*');
 }

 function prefetchOutfit(id){
  if(!id||id==='original'||outfitAssetCache.has(id)||prefetchedOutfits.has(id)||prefetchQueue.includes(id))return;
  if(prefetchQueue.length>=2)prefetchQueue.shift();
  prefetchQueue.push(id);
  pumpPrefetch();
 }

 function schedulePrefetchOutfit(id){
  clearTimeout(prefetchTimer);
  if(!id||id==='original'||outfitAssetCache.has(id)||prefetchedOutfits.has(id))return;
  prefetchTimer=setTimeout(()=>prefetchOutfit(id),120);
 }

 function cancelPrefetchSchedule(){
  clearTimeout(prefetchTimer);prefetchTimer=null;
 }

 function requestOutfit(id){
  cancelPrefetchSchedule();
  if(!id){
   outfitRequest=uid();outfitLoading=true;outfitNotice='正在恢复上次服装…';
   const reqId=outfitRequest;
   pendingRequests.set(reqId,'__restore__');
   clearTimeout(outfitTimer);
   outfitTimer=setTimeout(()=>{pendingRequests.delete(reqId);if(outfitRequest===reqId){outfitRequest='';outfitLoading=false;outfitNotice='';updateWardrobe();}},60000);
   parent.postMessage({channel:'liuli-companion',type:'wardrobe-request',requestId:reqId},'*');
   return;
  }
  targetOutfitId=id;
  if(id==='original'){
   clearTimeout(outfitTimer);outfitId='original';loadingOutfitId=null;outfitLoading=false;outfitAsset=null;outfitNotice='原装 · 完整生活动作';
   activeRoomScene?.setRoomOutfit?.(null);fittingScene?.setRoomOutfit?.(null);
   updateWardrobe();parent.postMessage({channel:'liuli-companion',type:'wardrobe-selected',id:'original'},'*');setTimeout(pumpPrefetch,40);return;
  }
  if(outfitAssetCache.has(id)){
   const cached=outfitAssetCache.get(id);
   outfitAssetCache.delete(id);outfitAssetCache.set(id,cached);
   clearTimeout(outfitTimer);outfitId=id;loadingOutfitId=null;outfitLoading=false;outfitAsset=cached;
   outfitNotice='已换上「'+(WARDROBE_CATALOG.find(o=>o.id===id)?.name||id)+'」· 动作流畅运行中';
   activeRoomScene?.setRoomOutfit?.(cached);fittingScene?.setRoomOutfit?.(cached);
   updateWardrobe();parent.postMessage({channel:'liuli-companion',type:'wardrobe-selected',id},'*');setTimeout(pumpPrefetch,40);return;
  }
  outfitRequest=uid();loadingOutfitId=id;outfitLoading=true;outfitNotice='服装加载中…';updateWardrobe();clearTimeout(outfitTimer);
  const reqId=outfitRequest;
  pendingRequests.set(reqId,id);
  outfitTimer=setTimeout(()=>{pendingRequests.delete(reqId);if(loadingOutfitId===id){loadingOutfitId=null;outfitLoading=false;outfitNotice='服装加载超时，请重试';updateWardrobe();setTimeout(pumpPrefetch,40);}},60000);
  parent.postMessage({channel:'liuli-companion',type:'wardrobe-request',id,requestId:reqId},'*');
 }

 window.addEventListener('message',async event=>{
  const d=event.data;if(event.source!==parent||d?.channel!=='liuli-companion')return;
  if(d.type==='wardrobe-error'){
   if(d.requestId&&pendingRequests.has(d.requestId)){
    const reqTarget=pendingRequests.get(d.requestId);
    pendingRequests.delete(d.requestId);
    prefetchedOutfits.delete(reqTarget);
    if(reqTarget===activePrefetchId){clearTimeout(prefetchTimeout);activePrefetchId=null;setTimeout(pumpPrefetch,40);}
    if(reqTarget===targetOutfitId||(reqTarget==='__restore__'&&!targetOutfitId)){
     clearTimeout(outfitTimer);outfitLoading=false;loadingOutfitId=null;
     outfitNotice='服装未能加载，保留当前造型';updateWardrobe();setTimeout(pumpPrefetch,40);
    }
   }
   return;
  }
  if(d.type!=='wardrobe-assets')return;
  const reqTarget=d.requestId?pendingRequests.get(d.requestId):null;
  if(d.requestId)pendingRequests.delete(d.requestId);
  if(reqTarget===activePrefetchId){clearTimeout(prefetchTimeout);activePrefetchId=null;setTimeout(pumpPrefetch,40);}
  try{
   const shouldEquip=(reqTarget==='__restore__'&&!targetOutfitId)||(d.id===targetOutfitId);
   if(d.id!=='original'&&d.assets){
    if(!validateWardrobe(d.assets)||d.assets.id!==d.id)throw Error('invalid outfit');
    await decodeBaseWardrobeAsset(d.assets);
     const actMode=activeRoomScene?.getAttribute?.('data-room-activity')||'walk';
     const prio=actMode==='type'||actMode==='write'?['desk','deskTransition']:actMode==='lounge'?['sofaBody','sofaSocial','transition']:actMode==='sleep'?['bedBody','transition']:['walk','idleChair'];
     if(shouldEquip&&activeRoomScene&&typeof decodeWardrobeSupplements==='function'){
      await decodeWardrobeSupplements(d.assets,{priorityKeys:prio.slice(0,1)}).catch(()=>{});
      void decodeWardrobeSupplements(d.assets,{priorityKeys:prio}).catch(()=>{});
     }else if(typeof decodeWardrobeSupplements==='function'){
      void decodeWardrobeSupplements(d.assets,{priorityKeys:prio}).catch(()=>{});
     }else{
      void decodeWardrobeAssets(d.assets).catch(()=>{});
     }
    putOutfitCache(d.id,d.assets);
   }
   if(shouldEquip){
    const asset=d.id==='original'?null:d.assets;
    if(activeRoomScene?.setRoomOutfit&&activeRoomScene.setRoomOutfit(asset)===false)throw Error('invalid scene');
    fittingScene?.setRoomOutfit?.(asset);
    outfitId=d.id;targetOutfitId=d.id;outfitAsset=asset;
    outfitNotice=d.id==='original'?'原装 · 完整生活动作':'已换上「'+(WARDROBE_CATALOG.find(o=>o.id===d.id)?.name||d.id)+'」· 动作流畅运行中';
    parent.postMessage({channel:'liuli-companion',type:'wardrobe-selected',id:outfitId},'*');
    clearTimeout(outfitTimer);outfitLoading=false;loadingOutfitId=null;
    setTimeout(pumpPrefetch,40);
   }
  }catch(e){
   if(d.id===targetOutfitId||reqTarget==='__restore__'){
    outfitNotice='服装素材未通过检查，保留当前造型';
    clearTimeout(outfitTimer);outfitLoading=false;loadingOutfitId=null;
   }
  }
  updateWardrobe();
 });
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.data?.channel!=='liuli-companion')return;
  if(event.data.type==='room-life-error'){activeRoomScene?.recordRoomDiagnostic?.('asset-error',{asset:'client.room-life-v20.js',stage:'chunk-load'});return;}
  if(event.data.type==='room-life-assets'){
   const a=event.data.assets;if(!validateRoomLifeAssets(a))return;
   ROOM_ACTIONS.lifeV10=a;if(!activeRoomScene&&typeof prewarmRoomLifeAssets==='function')void prewarmRoomLifeAssets(a);
   const p=activeRoomScene?.setRoomLifeAssets?.(a);if(p&&typeof p.then==="function")p.then(()=>activeRoomRestoreGate?.restore?.());else activeRoomRestoreGate?.restore?.();fittingScene?.setRoomLifeAssets?.(a);return;
  }
  if(event.data.type!=='room-assets')return;
  const a=event.data.assets;if(!a||!['floor-one','floor-two','garden','mirror'].every(k=>typeof a[k]==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a[k])&&a[k].length<5*1024*1024))return;
  roomArtAssets=a;
  ROOM_ACTIONS.house.floors[1]=a['floor-one'];ROOM_ACTIONS.house.floors[2]=a['floor-two'];
  ROOM_ACTIONS.house.repairs[1].url=a['floor-one'];ROOM_ACTIONS.house.repairs[2].url=a['floor-two'];ROOM_ACTIONS.house.actions.garden.frames[0]=a.garden;ROOM_ACTIONS.house.mirror=a.mirror;
  activeRoomScene?.setRoomArtAssets?.(a);fittingScene?.setRoomArtAssets?.(a);
 });
 const pending=new Map(),filters={},drafts=new Map();
 const uid=()=>`ui-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2)),x=>x.toString(16)).join('')}`;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const append=(parent,...children)=>{for(const c of children.flat(Infinity))if(c!==undefined&&c!==null)parent.append(typeof c==='string'?document.createTextNode(c):c);return parent;};
 const div=(cls,...children)=>append(node('div',null,cls),children);
 const badge=(label,kind='')=>node('span',label,'tag '+kind);
 const help=text=>node('p',text,'help');
 const stamp=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}):'尚无记录';
 const pretty=value=>node('pre',JSON.stringify(value,null,2));
 const details=(title,child)=>append(node('details'),node('summary',title),child);
 const empty=text=>div('empty',text||'这里还没有记录。');
 const card=(title,...children)=>append(node('section',null,'card'),title?node('h2',title):null,children);
 const grid=(...children)=>div('grid',children);
 function show(message,error=false){notice.textContent=message;notice.className=error?'error':'';if(roomWorkspace?.isOpen?.())roomWorkspace.announce(message,error);}
 function button(label,fn,cls=''){const b=node('button',label,cls);b.type='button';b.disabled=false;b.addEventListener('click',()=>{if(b.disabled)return Promise.resolve();try{const res=fn();if(res&&typeof res.then==='function'){const isNav=Boolean(b.dataset?.page);if(!isNav)b.disabled=true;return res.catch(e=>show(e.message||String(e),true)).finally(()=>{if(!isNav)b.disabled=false;});}return Promise.resolve(res);}catch(e){show(e.message||String(e),true);return Promise.resolve();}});return b;}
 function actions(...buttons){return div('actions',buttons);}
 function rpc(action,body={},rev,withRevision=false){const id=uid();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('请求超时，已保留当前草稿。写操作请先刷新核对结果。'));},75000);pending.set(id,{resolve,reject,timer,withRevision});parent.postMessage({channel:'liuli-companion',type:'request',id,action,body,revision:rev},'*');});}
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='liuli-companion'||event.data?.type!=='response')return;const {id,payload}=event.data,p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);if(payload.error){const e=Error(payload.error.message);e.code=payload.error.code;p.reject(e);}else{revision=payload.revision;p.resolve(p.withRevision?{data:payload.data,revision:payload.revision}:payload.data);}});
 const read=(a,b)=>{const key=a+':'+JSON.stringify(b||{});const hit=readCache.get(key);if(hit&&Date.now()-hit.at<READ_CACHE_TTL)return Promise.resolve(cloneData(hit.data));if(inflightReads.has(key))return inflightReads.get(key).then(cloneData);const req=rpc(a,b).then(res=>{readCache.set(key,{data:cloneData(res),at:Date.now()});return res;}).finally(()=>inflightReads.delete(key));inflightReads.set(key,req);return req;};
 const refreshActiveSurface=(force=false)=>roomWorkspace?.isOpen?.()?roomWorkspace.refresh(force):render();
 function updateHudTelemetry(n){
  const host=$('hud-telemetry');if(!host)return;
  if(!hudButtons){
   const bNight=button('',()=>openFurnitureForPage('night'),'hud-chip');bNight.title='打开床铺 · 作息与长夜';
   const bComms=button('◉ 通讯 · 近况',()=>openFurnitureForPage('overview'),'hud-chip');bComms.title='打开全息通讯视窗 · 近况与 QQ';
   const bWork=button('⌘ 工坊 · 舱室',()=>openFurnitureForPage('decor'),'hud-chip');bWork.title='打开工坊与舱室中枢 · 工具与物品';
   hudButtons={bNight,bComms,bWork};
   append(host,bNight,bComms,bWork);
  }
  if(n){
   const stage=stageNames[n.stage]||n.stage||'清醒';
   const e=typeof n.energy==='number'?` · 精力 ${Math.round(n.energy)}`:'';
   const m=typeof n.mood==='number'?` · 心情 ${Math.round(n.mood)}`:'';
   hudButtons.bNight.textContent=`${n.sleeping?'☾':'✧'} ${stage}${e}${m}`;
  }else if(!hudButtons.bNight.textContent){
   hudButtons.bNight.textContent='✧ 状态同步中';
  }
 }
 function applyRoomData(r){
  currentRoomData=r;
  const nextIdentity=JSON.stringify((r.items||[]).map(({id,name})=>[id,name])),nextEnv=`${Boolean(r.lamp)}:${Boolean(r.curtain)}`;
  const envMismatch=Boolean(cachedRoomShell&&typeof activeRoomScene?.setRoomEnvironment!=='function'&&cachedRoomEnv!==nextEnv);
  if(cachedRoomShell&&(nextIdentity!==cachedRoomIdentity||envMismatch)){
   roomDispose();roomDispose=()=>{};cachedRoomShell=null;cachedRoomResult=null;cachedRoomJson='';
   const shell=roomScene(r,latestNight||{sleeping:false,stage:'awake',energy:80,mood:70},latestJobs);
   cachedRoomShell=shell;cachedRoomIdentity=nextIdentity;cachedRoomEnv=nextEnv;
   const result=[shell];cachedRoomResult=result;cachedRoomJson=JSON.stringify(r);
   content.replaceChildren(...result);
   return;
  }
  cachedRoomIdentity=nextIdentity;cachedRoomEnv=nextEnv;cachedRoomJson=JSON.stringify(r);
  if(cachedRoomShell){
   cachedRoomShell._syncHotbar?.(r.items||[]);
   cachedRoomShell.classList.toggle('lamp-on',Boolean(r.lamp));
  }
  if(activeRoomScene)activeRoomScene.setRoomEnvironment?.({lamp:Boolean(r.lamp),curtain:Boolean(r.curtain)});
 }
 async function command(a,b={},reload=true){
  if(busy)throw Error('上一项操作还在处理');
  const originKey=activePanelKey,submittedDraft=drafts.get(originKey),useRev=a==='/room/save'?roomRevision:panelRevision;
  busy=true;
  try{
   const {data:result,revision:committedRevision}=await rpc(a,b,useRev,true);
   invalidateReadCache();
   if(a==='/room/save'){
    roomRevision=committedRevision;
    if(result&&Array.isArray(result.items))applyRoomData(result);
   }else{
    panelRevision=committedRevision;
   }
   show(result?.status==='queued'?'任务已排队，可在工坊系统页查看执行进度。':'操作已完成，已读取服务返回结果。');
   if(drafts.get(originKey)===submittedDraft)drafts.delete(originKey);
   if(reload){
    if(roomWorkspace?.isOpen?.())await roomWorkspace.refresh();
    else if(a!=='/room/save'||!(result&&Array.isArray(result.items)))await render();
   }
   return result;
  }finally{busy=false;}
 }
 function field(label,name,value='',type='text',options){
  const wrap=node('label',null,'field'+(type==='checkbox'?' check':'')+(type==='textarea'?' wide':''));let input;
  if(type==='select'){input=node('select');for(const opt of options||[]){const [v,l]=Array.isArray(opt)?opt:[opt,opt];const o=node('option',l);o.value=v;input.append(o);}input.value=value??'';}
  else if(type==='textarea'){input=node('textarea');input.value=value??'';}
  else {input=node('input');input.type=type;if(type==='checkbox')input.checked=Boolean(value);else if(type!=='file')input.value=value??'';}
  input.name=name;if(type==='number'){input.step='any';input.min='0';}if(type==='file')input.accept='image/png,image/jpeg,image/webp';
  append(wrap,type==='checkbox'?input:node('span',label),type==='checkbox'?node('span',label):input);
  return {node:wrap,input,get:()=>type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value};
 }
 function form(title,specs,submit,label='保存',description){
  const f=node('form',null,'form');const fields=specs.map(s=>Array.isArray(s)?field(...s):s);const body=div('form-grid',fields.map(f=>f.node));
  const formPage=activePanelKey;const saved=drafts.get(formPage)?.[title];if(saved)for(const f of fields)if(f.input.type!=='file'&&Object.hasOwn(saved,f.input.name)){if(f.input.type==='checkbox')f.input.checked=saved[f.input.name];else f.input.value=saved[f.input.name];}
  f.addEventListener('input',()=>{const all={...(drafts.get(formPage)||{})};all[title]=Object.fromEntries(fields.filter(x=>x.input.type!=='file').map(x=>[x.input.name,x.get()]));drafts.set(formPage,all);});
  const b=node('button',label);b.type='button';const performSubmit=async e=>{e.preventDefault();if(b.disabled||!f.reportValidity())return;b.disabled=true;try{await submit(Object.fromEntries(fields.map(x=>[x.input.name,x.get()])),fields);}catch(e){show(e.message||String(e),true);}finally{b.disabled=false;}};b.addEventListener('click',performSubmit);f.addEventListener('submit',performSubmit);f.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')void performSubmit(e);});
  append(f,body,div('actions',b));return card(title,description?help(description):null,f);
 }
 function jsonForm(title,value,submit,description){return form(title,[['设置 JSON','json',JSON.stringify(value,null,2),'textarea']],b=>{let data;try{data=JSON.parse(b.json);}catch{throw Error('JSON 格式不正确，草稿已保留');}return submit(data);},'保存设置',description);}
 function bridgeForm(title,value,submit){
  const labels={enabled:'启用',burstEnabled:'允许分条发送',burstMaxMessages:'最多连发条数',burstIntervalMinMs:'连发最短间隔',burstIntervalMaxMs:'连发最长间隔',longGapProbability:'长停顿概率',longGapMinMs:'长停顿最短时间',longGapMaxMs:'长停顿最长时间',maxSendPerMinute:'每分钟最大发送条数',maxSendPerHour:'每小时最大发送条数',maxMessageChars:'单条消息字数',maxGapMs:'最长间隔',gapBaseMs:'基础间隔',gapPerCharMs:'每字附加间隔',recommendedHint:'表达建议',firstDelayMinMs:'首条最短等候',firstDelayMaxMs:'首条最长等候',defaultMode:'默认接话模式',preSleepWaitEnabled:'潜水前先等一会儿',preSleepWaitMs:'潜水前观察时间',recommendedDefaultInfinite:'建议无限期潜水',sleepMinMs:'最短潜水时间',sleepMaxMs:'最长潜水时间',recommendedSleepMinMs:'建议最短潜水时间',recommendedSleepMaxMs:'建议最长潜水时间',recommendedProbability:'随机接话概率',recommendedKeywords:'唤醒关键词',recommendedAtMention:'被 @ 时接话',recommendedNameMention:'被叫名字时接话',recommendedQuestion:'遇到问题时接话',recommendedPoke:'被戳时接话',batchWindowMs:'消息合并窗口',maxWakePerMinute:'每分钟最多唤醒次数',maxWakePerHour:'每小时最多唤醒次数',noActionLimit:'连续不接话次数',maxWakeConfigReminders:'收尾提醒次数',proactiveProbability:'主动联系概率',defaultMs:'默认等待时间',minMs:'最短等待时间',maxMs:'最长等待时间',defaultQuietMs:'默认安静窗口',minQuietAfterNewMs:'新消息后最短安静时间',recentLimit:'近期消息保留条数',unreadLimit:'普通未读队列条数',contextWindow:'上下文消息条数',inlineWakeMessages:'唤醒时带上消息',wakeMessageLimit:'唤醒时未读条数',wakeRecentLimit:'唤醒时近期消息条数',wakeMaxChars:'唤醒消息字数预算',syncTtlMs:'表情同步间隔',maxListCount:'表情列表上限',includeInPrompt:'在提示中推荐表情',promptMaxStickers:'推荐表情数量',maxLength:'反馈字数上限',notifyOwnerOnError:'出错时通知主人',hideNotices:'隐藏一般提示',fatalNotify:'通知严重错误',checkIntervalMinMs:'最短检查间隔',checkIntervalMaxMs:'最长检查间隔',idleThresholdMs:'安静多久后考虑联系',probability:'主动联系概率',getPrompt:'读取人格',getUnread:'读取未读',getRecent:'读取近期消息',socialState:'读取社交状态',sendGroup:'群聊发言',sendPrivate:'私聊发言',reply:'引用回复',sendBurst:'分条发送',sendMessage:'发送消息',waitMessages:'等待消息',feedback:'反馈',getMyRecent:'查看自己的发言',getMessageDetail:'查看消息详情',getActiveMembers:'查看活跃成员',setWakeConfig:'设置接话条件',markRead:'标记已读',memory:'记忆工具',slangQuery:'查询黑话',slangSubmit:'学习黑话',getImages:'看图',getForwardMsg:'查看合并转发',sendPoke:'戳一戳',listStickers:'浏览表情',getStickerImage:'查看表情图片',sendSticker:'发送表情',setStickerRemark:'备注表情',stickerNote:'表情笔记',collectSticker:'收藏表情',getSelfImage:'查看自身形象',sendVoice:'发送语音'};
  const fields=[];const walk=(obj,prefix='')=>{for(const[k,v]of Object.entries(obj)){const path=prefix+k;if(v&&typeof v==='object'&&!Array.isArray(v)){walk(v,path+'.');continue;}if(!labels[k])continue;const seconds=k.endsWith('Ms'),array=Array.isArray(v);fields.push({path,seconds,array,spec:[labels[k]+(seconds?'（秒）':array?'（每行一项）':''),path,array?v.join('\n'):seconds?v/1000:v,typeof v==='boolean'?'checkbox':typeof v==='number'?'number':array||k==='recommendedHint'?'textarea':'text']});}};walk(value);
  return div('',form(title,fields.map(f=>f.spec),b=>{const patch=structuredClone(value);for(const f of fields){const parts=f.path.split('.'),key=parts.pop();let target=patch;for(const p of parts)target=target[p];target[key]=f.array?b[f.path].split('\n').map(x=>x.trim()).filter(Boolean):f.seconds?Math.round(b[f.path]*1000):b[f.path];}return submit(patch);}),details('高级完整设置',jsonForm(title+' · 高级',value,submit)));
 }
 const scopeField=(value='')=>['会话（private:QQ号 / group:群号）','scope',value];
 function filterForm(specs,key){return form('筛选',specs,async data=>{filters[key]={...data,page:1};drafts.delete(activePanelKey);await refreshActiveSurface();},'查看');}
 function pager(data,key){return div('pager',button('上一页',async()=>{filters[key]={...filters[key],page:Math.max(1,data.page-1)};await refreshActiveSurface();},'quiet'),node('span',`第 ${data.page} 页 · 共 ${data.total} 条`),button('下一页',async()=>{if(data.page*data.limit<data.total){filters[key]={...filters[key],page:data.page+1};await refreshActiveSurface();}},'quiet'));}
 function table(headers,rows){const t=node('table');append(t,append(node('thead'),append(node('tr'),headers.map(x=>node('th',x)))),append(node('tbody'),rows.map(row=>append(node('tr'),row.map(value=>append(node('td'),value instanceof Node?value:String(value??'')))))));return div('table-wrap',t);}
 function bar(label,value,desc){const p=node('progress');p.max=100;p.value=value;return card(label,node('div',Math.round(value),'metric'),p,help(desc));}
 function jsonDetails(value,title='查看详细数据'){return details(title,pretty(value));}
 function eventList(rows){return rows.length?div('list',rows.map(e=>div('entry',div('row',badge(e.type||e.kind||''),node('span',stamp(e.at),'muted')),node('p',typeof e.detail==='string'?e.detail:JSON.stringify(e.detail??e.error??e.result??{}),'small body')))):empty('还没有行为记录。');}
 function configForm(title,section,config,selected){const labels={allowSleep:'允许自动入睡',sleepHour:'夜间开始（小时）',wakeHour:'自然醒来（小时）',wakePolicy:'消息叫醒范围',maxWakeAttempts:'累计叫醒次数上限',minSleepMinutes:'最短休息（分钟）',maxSleepHours:'最长休息（小时）',dreamEnabled:'REM 自动做梦',enabled:'启用',autoExtract:'自动抽取用户事实',maxPerMessage:'每条消息最多事实数',recallBudget:'召回字符预算',forgetting:'启用遗忘降权',halfLifeDays:'0–5 级半衰期（天，JSON 数组）',archiveThreshold:'归档强度阈值',profileEnabled:'允许生成画像',dailyCap:'每日变化上限',decayPerDay:'每日自然衰减',stages:'关系阶段分数（JSON 数组）',quietStart:'安静时段开始',quietEnd:'安静时段结束',minAffinity:'最低好感度',unansweredBackoffMinutes:'未回复退避（分钟）',maxUnanswered:'最多连续主动次数',timeoutMs:'生成超时（毫秒）',maxJobsPerHour:'每小时生成任务上限',style:'附加表达风格',perceptionNotes:'感知提示补充'};
 const keys=selected||Object.keys(config[section]);const specs=keys.map(k=>{const v=config[section][k];return [labels[k]||k,k,Array.isArray(v)?JSON.stringify(v):v,k==='wakePolicy'?'select':typeof v==='boolean'?'checkbox':typeof v==='number'?'number':k==='style'||k==='perceptionNotes'?'textarea':'text',k==='wakePolicy'?[['private','仅允许私聊叫醒'],['all','私聊和群聊'],['none','仅自然醒或控制台叫醒']]:undefined];});
 return form(title,specs,b=>{const next=structuredClone(config);for(const k of keys)next[section][k]=Array.isArray(config[section][k])?JSON.parse(b[k]):b[k];return command('/settings/save',{config:next});});}
 async function overview(){const d=await read('/overview');if(d?.night){latestNight=d.night;updateHudTelemetry(d.night);}const stage=stageNames[d.night.stage]||d.night.stage;
  const hero=div('hero',div('',badge(d.connections.bridge.ok?'QQ 桥接已连接':'QQ 桥接待连接',d.connections.bridge.ok?'':'warn'),node('h2',d.night.sleeping?'在夜色里休息一会儿。':'陪伴，慢慢有了自己的日常。'),node('p',`${stage} · ${d.settings.allowSleep?'自动入睡已开启':'精力运行，自动入睡未开启'}`),help(d.night.initialized?'精力和心情为初始模拟值，尚未积累互动事件。':'精力和心情由互动及时间驱动。')),div('moon'));
  const metricActions={
   有效记忆:()=>openFurnitureForPage('memory'),
   历史日记:()=>openFurnitureForPage('diary'),
   梦境片段:()=>openFurnitureForPage('dreams'),
   待核对事实:()=>{workspaceStore.filters={...(workspaceStore.filters||{}),memory:{status:'conflict'}};openFurnitureForPage('memory');}
  };
  const metrics=div('grid four',...Object.entries({有效记忆:d.counts.activeMemory,历史日记:d.counts.diary,梦境片段:d.counts.dreams,待核对事实:d.counts.conflicts}).map(([k,v])=>{
   const c=card(k,node('div',v??'—','metric'),help(k==='有效记忆'?`陪伴索引 ${d.counts.indexedMemory} 条`:'来自实际存储 · 点击打开'));
   c.style.cursor='pointer';c.setAttribute('role','button');c.setAttribute('tabindex','0');c.title=`点击打开${k}`;
   const act=metricActions[k];if(act){c.addEventListener('click',act);c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});}
   return c;
  }));
  const connLabels={bridge:'QQ 桥接',memory:'Basic Memory',diary:'原日记服务',minecraft:'Minecraft Numen'};
  const connections=card('连接状态',...Object.entries(d.connections).map(([k,v])=>{
   const label=connLabels[k]||k,isOk=Boolean(v.ok);
   const text=isOk?'已连接':(k==='minecraft'?'未启动 / 离线':v.error?.message||'不可用');
   return div('entry row',node('span',label),badge(text,isOk?'':'warn'));
  }));
  return [hero,metrics,div('grid',bar('精力',d.night.energy,'休息恢复，清醒和互动消耗。'),bar('心情',d.night.mood,'用于陪伴表达的模拟状态。')),grid(connections,card('房间此刻',node('p',d.room.description,'body'),badge(d.room.lamp?'台灯亮着':'台灯关着'),badge(d.room.curtain?'窗帘拉开':'窗帘合上'),actions(button('回到小屋看看',()=>roomWorkspace?.close?.(),'quiet'),button('调整舱室布置',()=>openFurnitureForPage('decor'),'quiet')))),card('最近发生',eventList(d.events))];
 }
 async function expression(){const [settings,bridge]=await Promise.all([read('/settings'),read('/bridge/settings')]);return [configForm('表达补充','expression',settings.config),help('以下开关和节奏直接写回原 QQ 桥接，下一轮按桥接规则生效。工具注册表可能需要原 MCP 重载后更新。'),...['send','wake','wait','context','sticker','feedback','tools'].filter(k=>bridge.config[k]!==undefined).map(k=>bridgeForm(({send:'分句与发送节奏',wake:'接话与唤醒策略',wait:'等候与连续对话',context:'上下文与感知',sticker:'表情策略',feedback:'反馈策略',tools:'感知与工具开关'})[k],bridge.config[k],patch=>command('/bridge/settings/save',{etag:bridge.etag,patch:{[k]:patch}}),'展示当前实际值；未填写的其他配置继续保留。'))];}
 async function relations(){const [d,a,c,profileCfg]=await Promise.all([read('/subjects/merge_candidates'),read('/affinity'),read('/settings'),read('/memory/profile/config')]);const profiles=profileCfg.profiles;return [grid(card('主体列表',d.subjects.length?table(['QQ 主体','会话范围','记忆数','关联到'],d.subjects.map(s=>[s.id,s.scopes.join('\n'),s.count,s.mergedInto||'—'])):empty('记忆中还没有主体。')),form('关联同一人的身份',[['源主体 ID','from',''],['目标主体 ID','to','']],b=>command('/subjects/merge',b),'合并身份','合并只建立身份关联，保留原来会话的可见范围。')),card('合并记录',d.history.length?div('list',d.history.slice().reverse().map(r=>div('entry row',node('span',`${r.from} → ${r.to} · ${stamp(r.at)}`),r.active?button('撤销',()=>command('/subjects/rollback',{id:r.id}),'quiet'):badge('已撤销')))):empty()),grid(card('好感度',a.items.length?table(['会话','主体','分数','阶段'],a.items.map(r=>[r.scope,r.subject,r.value.toFixed(1),['初识','熟悉','亲近','信任'][r.stage]||r.stage])):empty('尚无互动结算。')),form('调整好感度',[scopeField(),['主体 QQ 号','subject',''],['好感度（0–100）','value',0,'number']],b=>command('/affinity/save',b))),configForm('关系规则','affinity',c.config),configForm('记忆等级与遗忘','memory',c.config),form('从已确认事实生成人物画像',[scopeField(),['主体 QQ 号','subject','']],b=>command('/memory/profile/build',b),'生成画像','只引用指定会话内的事实，并保留来源编号。'),...Object.values(profiles).map(p=>card(`${p.scope} · ${p.subject}`,badge(p.blocked?'已停用':'有效',p.blocked?'warn':''),node('div',p.content||'尚无正文','body'),details('编辑画像',form('画像 '+p.scope+'|'+p.subject,[['画像内容','content',p.content||'','textarea']],b=>command('/memory/profile/save',{...b,scope:p.scope,subject:p.subject,sourceIds:p.sourceIds||[]}))),jsonDetails(p.sourceIds||[],'来源记忆编号'),actions(button(p.blocked?'恢复画像':'收起并停用',()=>command(p.blocked?'/memory/profile/unblock':'/memory/profile/delete',{scope:p.scope,subject:p.subject}),'quiet'))))];}
 async function proactive(){const [d,s,settings,bridge,logs]=await Promise.all([read('/proactive/state'),read('/proactive/sessions'),read('/settings'),read('/bridge/settings'),read('/proactive/log')]);return [card('当前主动联系',badge(d.bridge.config?.proactive?.enabled?'已开启':'已关闭',d.bridge.config?.proactive?.enabled?'':'warn'),help('沿用现有 QQ 主动调度。安装面板不会改变原来的总开关。'),d.sleeping?badge('睡眠中，普通主动机会暂缓','warn'):null),grid(bridgeForm('原桥接主动设置',bridge.config.proactive||{},patch=>command('/bridge/settings/save',{etag:bridge.etag,patch:{proactive:patch}})),configForm('附加联系条件','proactive',settings.config)),form('立即联系一次',[['目标会话','scope','','select',[['','请选择'],...(s.conversations||[]).map(x=>[x.key,x.key])]]],b=>command('/proactive/now',b),'提交联系任务','此操作会调用真实 QQ 会话。仍遵守暂停、白名单和睡眠等条件。'),card('各会话状态',(s.conversations||[]).length?table(['会话','未读','上次回复','主动联系'],s.conversations.map(r=>[r.key,r.unreadCount,stamp(r.lastAiReplyAt),button(d.sessions[r.key]?.muted?'恢复':'暂停',()=>command('/proactive/mute',{scope:r.key,muted:!d.sessions[r.key]?.muted}),'quiet')])):empty()),card('最近判断',eventList(logs.items))];}
 async function tools(){const d=await read('/tools');const search=field('筛选工具','search',filters.tools?.query||'');const listing=div('list'),testOutput=div('stack');const draw=()=>{listing.replaceChildren();const q=search.input.value.toLowerCase();const selected=d.tools.filter(t=>(t.name+' '+t.label+' '+t.group).toLowerCase().includes(q));for(const t of selected)listing.append(div('entry',div('row wrap',node('strong',t.name,'tool-name'),badge(t.group)),node('p',t.label,'small'),badge(t.available?'已加载':'不可用',t.available?'':'warn'),t.readOnly?badge('可只读试运行'):null));if(!selected.length)listing.append(empty('没有匹配的工具。'));};search.input.addEventListener('input',()=>{filters.tools={query:search.input.value};draw();});draw();return [card('工具来自当前 DSH',help(`发现 ${d.tools.length} 项能力。列表反映运行时已经加载的工具；桥接开关还会在实际调用时再次检查。`),search.node,listing),form('试运行',[['能力','name','clock','select',d.tools.filter(t=>t.readOnly).map(t=>[t.name,t.name])],['输入 / 目标语言与文本','input','','textarea']],async b=>{const result=await command('/tools/test',b,false);testOutput.replaceChildren(card('试运行结果',typeof result.text==='string'?node('div',result.text,'body'):pretty(result)));},'运行一次','测试入口只提供明确的只读能力；原 QQ 写操作在对应管理页提交。'),testOutput];}
 async function qq(){const [account,avatars]=await Promise.all([read('/qzone'),read('/avatar')]);const qf=filters.qq||{},feedOutput=div('stack');return [card('当前 QQ',pretty(account.account),badge(account.auth.ready?'空间登录态已取得':'尚未读取空间登录态',account.auth.ready?'':'warn'),actions(button('从已登录 QQ 获取空间权限',()=>command('/qzone/auth'), 'quiet'))),grid(form('QQ 资料',[['昵称','nickname',account.account.nickname||''],['个性签名','personalNote','']],b=>command('/qq/profile',b),'更新真实资料'),form('群名片',[['群号','groupId',''],['自己的 QQ 号','userId',account.account.user_id||''],['群名片','card','']],b=>command('/qq/card',b),'更新群名片')),grid(form('长签名',[['签名','value','','textarea']],b=>command('/qq/signature',b),'更新签名'),form('戳一戳',[scopeField(),['对象 QQ 号','subject','']],b=>command('/qq/poke',b),'发送戳一戳')),grid(form('查看空间动态',[['QQ 号（留空看好友动态）','uin',qf.uin||''],['页码','page',qf.page||1,'number']],async b=>{filters.qq=b;const feed=await read('/qzone/feed',b);feedOutput.replaceChildren(card('空间动态',feed.items.length?div('list',feed.items.map(x=>div('entry',node('h3',x.name||x.uin),help(stamp(x.at*1000)),node('div',x.content,'body'),help(`评论 ${x.comments} · 赞 ${x.likes}`)))):empty('暂无动态。')));},'读取动态'),form('发布说说',[['正文','content','','textarea']],b=>command('/qzone/publish',b),'发布到真实 QQ 空间','日记不会自动同步到这里。点击发布会产生一条真实动态。')),feedOutput,form('加入头像库',[['名称','name',''],field('上传 PNG/JPEG/WebP（最大 2 MB）','file','','file'),['或填写 QQ 图片地址','image','']],async(b,fields)=>{const file=fields.find(f=>f.input.name==='file').input.files[0];let image=b.image;if(file){if(file.size>2*1024*1024)throw Error('图片超过 2 MB，请缩小后上传');image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}await command('/avatar/pool/add',{name:b.name,image});},'加入待审核头像'),card('头像库',avatars.pool.length?div('grid three',avatars.pool.map(a=>{const image=node('img',null,'avatar');image.src=a.image;image.alt=a.name;return card(a.name,image,badge(a.approved?'审核通过':'待审核',a.approved?'':'warn'),avatars.current?.id===a.id?badge('当前使用'):null,actions(button(a.approved?'撤销审核':'审核通过',()=>command('/avatar/pool/review',{id:a.id,approved:!a.approved}),'quiet'),a.approved?button('设为 QQ 头像',()=>command('/avatar/set',{id:a.id})):null,button('移出头像库',()=>command('/avatar/pool/delete',{id:a.id}),'quiet')));})):empty('先加入图片，再审核和切换。'))];}
 async function decor(ctx){
  if(ctx?.force||!currentRoomData){
   const snap=await rpc('/room',{},undefined,true);
   roomRevision=snap.revision;
   if(snap.data)applyRoomData(snap.data);
  }
  const r=currentRoomData||{lamp:false,curtain:true,description:'',items:[],interactions:[]};
  return [
   card('舱室环境与照明',div('row wrap',div('',badge(r.lamp?'台灯亮着':'台灯关着'),badge(r.curtain?'窗帘拉开':'窗帘合上')),actions(button(r.lamp?'关灯':'开灯',()=>command('/room/save',{patch:{lamp:!r.lamp}})),button(r.curtain?'合上窗帘':'拉开窗帘',()=>command('/room/save',{patch:{curtain:!r.curtain}}),'quiet'))),help('也可直接在小屋全息视窗中点击台灯或窗帘切换。')),
   form('房间里的故事',[['描述','description',r.description,'textarea']],b=>command('/room/save',{patch:{description:b.description}}),'保存房间','房间描述和物品状态会进入琉璃的对话上下文。'),
   grid(
    form('添一件物品',[['物品名称','name',''],['摆放位置或状态','state','','textarea']],b=>command('/room/save',{patch:{items:[...(r.items||[]),{id:uid(),...b}]}}),'放进房间'),
    card('房间里的物品',(r.items||[]).length?r.items.map(item=>div('entry',node('h3',item.name),node('p',item.state,'body'),details('调整物品',form('物品 · '+item.name,[['名称','name',item.name],['位置或状态','state',item.state,'textarea']],b=>command('/room/save',{patch:{items:r.items.map(x=>x.id===item.id?{...x,...b}:x)}}))),actions(button('收起这件物品',()=>command('/room/save',{patch:{items:r.items.filter(x=>x.id!==item.id)}}),'quiet')))):empty('还没有添加物品。'))
   ),
   card('互动记录',eventList((r.interactions||[]).slice().reverse().map(x=>({at:x.at,type:'房间互动',detail:x.changes}))))
  ];
 }
 async function system(){const [d,s,backups]=await Promise.all([read('/diagnostics'),read('/settings'),read('/system/backups')]);const sysOutput=div('stack');return [sysOutput,card('模块与来源',pretty(d.sources),jsonDetails(d.runtime,'运行时能力'),actions(button('检查全部连接',async()=>sysOutput.replaceChildren(card('连接检查',pretty(await read('/health')))),'quiet'),button('查看管理员与白名单',async()=>sysOutput.replaceChildren(card('原 QQ 管理范围',pretty(await read('/admins')))),'quiet'))),configForm('生成任务预算','generation',s.config),card('后台任务',d.jobs.length?div('list',d.jobs.map(j=>div('entry',div('row wrap',badge(({dream:'做梦',diary:'写日记',extract:'记忆抽取',profile:'人物画像'})[j.kind]||j.kind),badge(statusNames[j.status],['failed','unknown'].includes(j.status)?'warn':'')),help(`${stamp(j.at)} · ${j.payload?.scope||''}`),j.error?node('div',j.error.message,'body small'):null,jsonDetails({id:j.id,result:j.result,generatedContent:j.generatedContent},'任务详情'),j.status==='unknown'&&j.kind==='diary'&&j.generatedContent?actions(button('核对原日记',()=>command('/jobs/reconcile',{id:j.id}),'quiet')):j.status==='failed'?actions(button('重试已失败任务',()=>command('/jobs/retry',{id:j.id}),'quiet')):null))):empty('还没有后台任务。'),help('结果待核对表示进程中断或外部结果未知；不会自动重复写入或发布。')),card('状态备份',help('备份包括陪伴设置与元数据。原聊天、Basic Memory 笔记和历史日记继续使用各自的原存储。'),actions(button('创建状态备份',()=>command('/system/backup'))),backups.items.length?div('list',backups.items.slice(0,20).map(name=>div('entry row',node('span',name,'small'),button('恢复此备份',()=>command('/system/restore',{name}),'quiet')))):empty('还没有手动备份。每次状态写入另有自动上一版备份。')),card('行为与错误记录',eventList(d.events))];}
 async function about(){return [card('从一页状态，到完整的日常',node('p','琉璃陪伴中心将记忆、关系、睡眠、梦境、日记与房间接进已有的 DeepSeek Harness 和 QQ 桥接。','body'),node('p','继续使用原来的人格、记忆库和日记。状态分数是可解释的陪伴模拟，所有写操作由本机服务处理。','body')),card('功能来源',node('p','房间角色复用已安装 dsh-dafeiyu 的原版动画；来源 PC2005-cloud/dsh-pet，MIT 许可。','body'),node('p','功能设计参考 LUOSHUI319 / astrbot_plugin_congling（从绫开始），在当前 DSH 上重新实现本机适配。','body'),node('p','参考版本：9ed658dcfa0e6abf1e471cc338560a46cc298436','muted'),node('p','版本 1.0.0 · 原生 DSH 页面和主机服务','muted')),card('数据与边界',node('p','私聊和群聊记忆按会话隔离；日记只追加，收起不删除；房间和睡眠由一位琉璃共享。原有主动联系开关与自动日记任务沿用当前设置。','body'),node('p','QQ 扩展实际可用性取决于当前网关支持。未支持的操作会显示真实失败，不会用成功提示代替结果。','body'))];}
 function ensureReader(){
  if(!roomBookReader)roomBookReader=createRoomBookReader({document,request:requestBooks,onRead:()=>activeRoomScene?.setRoomActivity?.({preview:'read'})});
  return roomBookReader;
 }
 function wrapCustomView(key,fn,{cacheable=true}={}){
  const wrapped=async ctx=>{
   activePanelKey=key;
   if(ctx?.force)invalidateReadCache();
   const nodes=await fn(ctx);
   if(key!=='decor')panelRevision=revision;
   if(cacheable)cachedViewNodes.set(key,nodes);
   $('updated').textContent='更新于 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
   return nodes;
  };
  if(cacheable)wrapped.warm=()=>cachedViewNodes.get(key)||null;
  return wrapped;
 }
 function ensureWorkspace(){
  if(!roomWorkspace){
   roomWorkspace=createRoomWorkspace({
    document,
    request:workspaceRequest,
    store:workspaceStore,
    onClose:()=>{activePanelKey='room';},
    customViews:{
     overview:wrapCustomView('overview',overview),
     qq:wrapCustomView('qq',qq),
     proactive:wrapCustomView('proactive',proactive),
     expression:wrapCustomView('expression',expression),
     relations:wrapCustomView('relations',relations),
     tools:wrapCustomView('tools',tools),
     decor:wrapCustomView('decor',decor,{cacheable:false}),
     system:wrapCustomView('system',system),
     about:wrapCustomView('about',about)
    }
   });
  }
  return roomWorkspace;
 }
 let roomDispose=()=>{};
 function roomScene(r,night,jobs){
  const remembered={...roomView},furnitureButtons={};
  if(!ROOM_ACTIONS.lifeV10)parent.postMessage({channel:'liuli-companion',type:'room-life-request'},'*');
  if(!roomArtAssets)parent.postMessage({channel:'liuli-companion',type:'room-assets-request'},'*');
  const status=node('span','','room-life-status'),source=badge(''),buttons=[],floorButtons=[];let detailButton=null,roomDetail=false;
  const diagnosticText=node('pre',''),diagnosticError=node('p',''),diagnosticPanel=details('房间运行记录',div('',diagnosticError,diagnosticText));diagnosticError.setAttribute('role','alert');
  const onDiagnostic=event=>{if(event.kind.endsWith('error')){diagnosticError.textContent=event.kind==='draw-error'?'动作绘制失败，已保留上一帧。切换动作可重试。':'部分动作素材未能加载，已保留当前可见画面。可重试加载。';diagnosticPanel.open=true;}else if(event.kind==='draw-retry'||event.kind==='load-ready')diagnosticError.textContent='';diagnosticText.textContent=(diagnosticText.textContent+'\n'+JSON.stringify(event)).split('\n').slice(-80).join('\n');};
  const setImmersive=full=>{if(full!==undefined)shell.classList.toggle('room-immersive',full);else full=shell.classList.toggle('room-immersive');roomView.immersive=full;expand.textContent=full?'收回小屋':'放大看';};
  const expand=button('放大看',()=>setImmersive(),'quiet room-expand');
  const scene=createBlockRoom(r,{petAssets:DAFEIYU_CLIPS,actionAssets:ROOM_ACTIONS,night,jobs,preview:remembered.preview,onDiagnostic,onFurniture:id=>openFurniture(id),onFloor:(value,view)=>{roomView.floor=String(value);roomView.detail=Boolean(view?.detail);for(const b of floorButtons)b.node.setAttribute('aria-pressed',String(b.value===value));roomDetail=Boolean(view?.detail);detailButton?.setAttribute('aria-pressed',String(roomDetail));},onActivity:a=>{if(a.preview!==undefined)roomView.preview=a.preview;status.textContent=a.label;if(a.preview!==undefined)for(const item of buttons){item.node.setAttribute('aria-pressed',String(item.mode===a.preview));if(item.upstairs&&a.availableActions)item.node.disabled=!a.availableActions.includes(item.mode);}source.textContent=({night:'跟随真实睡眠',diary:'正在写日记',preview:'动作预览',leisure:'日常小动作'})[a.source];},onLamp:()=>command('/room/save',{patch:{lamp:!(currentRoomData||r).lamp}}).catch(e=>show(e.message,true)),onCurtain:()=>command('/room/save',{patch:{curtain:!(currentRoomData||r).curtain}}).catch(e=>show(e.message,true))});
  activeRoomScene=scene;
  const restoreGate=createRoomRestoreGate({scene,runtimeReady,getRuntime:()=>roomRuntime,hasAssets:()=>Boolean(ROOM_ACTIONS.lifeV10),isActive:()=>activeRoomScene===scene,onWait:()=>onDiagnostic({kind:'asset-error',stage:'restore',error:'动作恢复等待超时，先显示当前房间'})});
  activeRoomRestoreGate=restoreGate;
  if(ROOM_ACTIONS.lifeV10){const p=scene.setRoomLifeAssets?.(ROOM_ACTIONS.lifeV10);if(p&&typeof p.then==='function')p.then(()=>restoreGate.restore());}
  if(roomArtAssets)scene.setRoomArtAssets?.(roomArtAssets);
  let runtimeRestored=false;const restoreRuntime=async()=>{await restoreGate.restore();runtimeRestored=restoreGate.done;};
  diagnosticPanel.append(button('重试动作素材',async()=>{if(ROOM_ACTIONS.lifeV10)await scene.setRoomLifeAssets?.(ROOM_ACTIONS.lifeV10);else parent.postMessage({channel:'liuli-companion',type:'room-life-request'},'*');if(roomArtAssets)scene.setRoomArtAssets?.(roomArtAssets);else parent.postMessage({channel:'liuli-companion',type:'room-assets-request'},'*');await restoreRuntime();},'quiet'));
  void restoreRuntime();
  if(outfitAsset)scene.setRoomOutfit?.(outfitAsset);
  const wardrobeStatus=node('span',outfitNotice,'muted'),wardrobeChoices=div('wardrobe-choices'),wardrobeButtons=[];
  for(const item of [{id:'original',name:'原装'},...WARDROBE_CATALOG]){
   const b=button(item.name,()=>requestOutfit(item.id),'quiet');
   b.setAttribute('aria-pressed',String(item.id===outfitId));
   b.addEventListener('mouseenter',()=>schedulePrefetchOutfit(item.id));
   b.addEventListener('mouseleave',cancelPrefetchSchedule);
   b.addEventListener('focus',()=>schedulePrefetchOutfit(item.id));
   b.addEventListener('blur',cancelPrefetchSchedule);
   wardrobeButtons.push({id:item.id,b});wardrobeChoices.append(b);
  }
  let previewScene=null,previewMode='walk';const previewButtons=[],previewLabel=node('strong','试衣预览'),previewStage=div('wardrobe-preview-stage'),previewControls=div('wardrobe-preview-controls');
  const startPreview=()=>{
   if(!previewScene){
    previewScene=createBlockRoom(r,{petAssets:DAFEIYU_CLIPS,actionAssets:ROOM_ACTIONS,preview:previewMode,onActivity:()=>{},onFloor:()=>{}});
    previewStage.append(previewScene);
    fittingScene=previewScene;
    if(ROOM_ACTIONS.lifeV10)previewScene.setRoomLifeAssets?.(ROOM_ACTIONS.lifeV10);
    if(roomArtAssets)previewScene.setRoomArtAssets?.(roomArtAssets);
    if(outfitAsset)previewScene.setRoomOutfit?.(outfitAsset);
    previewScene.setRoomDetail?.(true);
    previewScene.setAttribute('role','img');
    previewScene.setAttribute('aria-label','当前服装的动态试衣预览');
    for(const item of previewScene.querySelectorAll?.('[tabindex]')||[])item.setAttribute('tabindex','-1');
   }
   previewScene.setRoomPaused?.(false);syncPreview();
  };
  const syncPreview=()=>{previewLabel.textContent='试衣预览 · '+(WARDROBE_CATALOG.find(o=>o.id===outfitId)?.name||'原装');if(previewScene)previewScene.setRoomOutfit?.(outfitAsset);};
  for(const [mode,label]of [['walk','走动'],['lounge','沙发'],['type','打字'],['write','写字'],['sleep','睡觉'],['garden','浇水']]){const b=button(label,()=>{previewMode=mode;previewScene?.setRoomActivity({preview:mode,teleport:true});for(const item of previewButtons)item.b.setAttribute('aria-pressed',String(item.mode===mode));},'quiet');b.setAttribute('aria-pressed',String(mode===previewMode));previewButtons.push({mode,b});previewControls.append(b);}
  updateWardrobe=()=>{
   wardrobeStatus.textContent=outfitNotice;
   for(const{id,b}of wardrobeButtons){
    const isSelected=id===outfitId;
    const isLoading=id===loadingOutfitId;
    b.setAttribute('aria-pressed',String(isSelected));
    b.setAttribute('aria-busy',String(isLoading));
    b.classList.toggle('loading',isLoading);
    b.disabled=!scene.setRoomOutfit;
   }
   syncPreview();
  };
  const closeWardrobe=button('收起换装',()=>{wardrobeBox.hidden=true;previewScene?.setRoomPaused?.(true);mirrorButton.focus?.();},'quiet');
  const wardrobeBox=div('room-mirror-wardrobe',div('row wrap',node('h3','全息镜 · 换装'),closeWardrobe),div('room-wardrobe',wardrobeChoices,wardrobeStatus),div('wardrobe-preview',previewLabel,previewStage,previewControls,help('选衣服后，这里会同步展示。可以切换预览动作，不影响小屋中她正在做的事。')));
  wardrobeBox.hidden=true;
  wardrobeBox.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeWardrobe.click();}});
  const openFurniture=(id,initialView)=>{
   if(id==='bookshelf'){void ensureReader().open();return;}
   if(id==='mirror'){wardrobeBox.hidden=false;startPreview();setTimeout(()=>{if(!wardrobeBox.hidden&&WARDROBE_CATALOG[0])prefetchOutfit(WARDROBE_CATALOG[0].id);},200);wardrobeBox.scrollIntoView?.({block:'nearest',behavior:'smooth'});closeWardrobe.focus?.();return;}
   const group=furnitureGroups[id];if(!group)return;
   const workspace=ensureWorkspace();
   const focused=document.activeElement;
   void workspace.open(id,focused?.getAttribute?.('data-room-furniture')===id?focused:(activeFurnitureButtons[id]||furnitureButtons[id]),initialView).catch(e=>show(e.message||String(e),true));
  };
  openRoomFurniture=openFurniture;
  updateWardrobe();if(!outfitRequest)requestOutfit();
  const floorControls=div('room-floor-controls');for(const[value,label]of[['all','双层总览'],['1','一楼'],['2','二楼']]){const b=button(label,()=>scene.setRoomFloor(value),'quiet');b.setAttribute('aria-pressed',String(value===(night.sleeping?'2':'1')));floorButtons.push({value,node:b});floorControls.append(b);}
  if(scene.setRoomDetail){detailButton=button('人物特写',()=>scene.setRoomDetail(!roomDetail),'quiet room-detail-button');detailButton.setAttribute('aria-pressed','false');floorControls.append(detailButton);}
  const controls=div('room-life-controls');
  for(const[mode,label]of[['auto','随她生活'],['sleep','盖被睡觉'],['write','写字'],['type','敲键盘'],['lounge','沙发休息'],['walk','散步'],...(scene.roomActions||[])]){const b=button(label,()=>{scene.setRoomActivity({preview:mode});for(const item of buttons)item.node.setAttribute('aria-pressed',String(item.mode===mode));},'quiet');b.setAttribute('aria-pressed',String(mode===remembered.preview));buttons.push({mode,node:b,upstairs:(scene.roomActions||[]).some(([m])=>m===mode)});controls.append(b);}
  const furnitureControls=div('room-furniture-controls');
  const mirrorButton=button('全息镜 · 换装',()=>openFurniture('mirror'),'quiet');
  for(const[id,label]of [['comms','通讯屏 · 近况与QQ'],['computer','电脑 · 记忆与人格'],['workbench','工坊台 · 工具与系统'],['bed','床 · 长夜与梦境'],['enchant','附魔台 · 日记'],['bookshelf','书架 · 翻书与续读']]){const b=button(label,()=>openFurniture(id),'quiet');furnitureButtons[id]=b;furnitureControls.append(b);}
  furnitureButtons.mirror=mirrorButton;furnitureControls.append(mirrorButton);
  activeFurnitureButtons=furnitureButtons;
  const hotbarSlots=[];
  const hotbarDetails=details('屋里的 '+(r.items||[]).length+' 件物品',div('block-hotbar',(r.items||[]).map((item,i)=>{const slot=div('block-slot',node('small',String(i+1).padStart(2,'0')),node('span',item.name));slot.title=item.state;hotbarSlots.push(slot);return slot;})));
  const shell=div('block-room-shell'+(r.lamp?' lamp-on':'')+(remembered.immersive?' room-immersive':''),div('block-room-heading',div('',node('span','HOLOGRAM VIEWPORT // DECK 01–02','block-kicker'),node('h2','琉璃的小鲸鱼双层小屋'),node('p','全息观测视窗 · 橡木与白桦双层生活舱 · 14 × 10 格','block-subtitle')),div('room-heading-actions',source,expand)),floorControls,scene,div('room-life-now',status,node('span','点舱内家具开启全息终端 · 点小鲸鱼摸摸头','muted')),furnitureControls,controls,help('通讯屏查看近况、QQ 与表达；电脑管理记忆、人格与关系；工坊台收纳工具、舱室布置与系统；二楼有床铺、附魔台日记、书架和全息镜换装。'),hotbarDetails);
  shell._syncHotbar=items=>{items.forEach((item,i)=>{if(hotbarSlots[i])hotbarSlots[i].title=item.state||'';});};
  shell.append(wardrobeBox,diagnosticPanel);
  const onImmersiveEsc=e=>{if(e.defaultPrevented||e.key!=='Escape'||!roomView.immersive||roomWorkspace?.isOpen?.()||!wardrobeBox.hidden||document.querySelector?.('dialog[open]'))return;e.preventDefault();setImmersive(false);expand.focus?.();};
  document.addEventListener?.('keydown',onImmersiveEsc);
  if(remembered.floor)scene.setRoomFloor?.(remembered.floor);if(remembered.detail)scene.setRoomDetail?.(true);expand.textContent=remembered.immersive?'收回小屋':'放大看';
  let stopped=false,timer;
  const poll=async()=>{if(stopped||activeRoomScene!==scene)return;if(!scene.isConnected||document.hidden){timer=setTimeout(poll,5000);return;}try{const[n,j]=await Promise.all([rpc('/night/state'),rpc('/jobs')]);latestNight=n;latestJobs=j.items||[];updateHudTelemetry(n);readCache.set('/night/state:{}',{data:cloneData(n),at:Date.now()});readCache.set('/jobs:{}',{data:cloneData(j),at:Date.now()});if(!stopped&&activeRoomScene===scene&&scene.isConnected)scene.setRoomActivity({night:n,jobs:j.items});}catch{if(!stopped)source.textContent='状态暂未刷新';}finally{if(!stopped&&activeRoomScene===scene)timer=setTimeout(poll,5000);}};
  let runtimeTimer;const runtimeTick=()=>{if(stopped)return;void restoreRuntime();if(runtimeRestored&&!document.hidden)saveRoomRuntime();runtimeTimer=setTimeout(runtimeTick,1000);};runtimeTimer=setTimeout(runtimeTick,1000);
  timer=setTimeout(poll,5000);roomDispose=()=>{if(runtimeRestored)saveRoomRuntime(true);stopped=true;document.removeEventListener?.('keydown',onImmersiveEsc);restoreGate.dispose();clearTimeout(runtimeTimer);clearTimeout(timer);scene.disposeRoomAmbient?.();previewScene?.disposeRoomAmbient?.();if(fittingScene===previewScene)fittingScene=null;if(activeRoomScene===scene){activeRoomScene=null;updateWardrobe=()=>{};openRoomFurniture=null;activeFurnitureButtons={};}};return shell;
 }
 async function room(){
  const version=renderVersion;
  const dataPromise=prefetchedRoom||Promise.all([rpc('/room',{},undefined,true),read('/night/state'),read('/jobs')]);
  prefetchedRoom=null;
  let [snapshot,n,j]=await dataPromise;
  if(!snapshot)[snapshot,n,j]=await Promise.all([rpc('/room',{},undefined,true),read('/night/state'),read('/jobs')]);
  if(version!==renderVersion)return [];
  const r=snapshot.data;
  roomRevision=snapshot.revision;
  currentRoomData=r;latestNight=n;latestJobs=j?.items||[];
  updateHudTelemetry(n);
  const nextIdentity=JSON.stringify((r.items||[]).map(({id,name})=>[id,name])),nextEnv=`${Boolean(r.lamp)}:${Boolean(r.curtain)}`;
  const envMismatch=Boolean(cachedRoomShell&&typeof activeRoomScene?.setRoomEnvironment!=='function'&&cachedRoomEnv!==nextEnv);
  if(cachedRoomShell&&(nextIdentity!==cachedRoomIdentity||envMismatch)){roomDispose();roomDispose=()=>{};cachedRoomShell=null;cachedRoomResult=null;cachedRoomJson='';}
  cachedRoomIdentity=nextIdentity;cachedRoomEnv=nextEnv;
  const shell=cachedRoomShell||roomScene(r,n,j.items);
  cachedRoomShell=shell;
  shell._syncHotbar?.(r.items||[]);
  shell.classList.toggle('lamp-on',Boolean(r.lamp));
  if(activeRoomScene){
   activeRoomScene.setRoomPaused?.(false);
   activeRoomScene.setRoomEnvironment?.({lamp:Boolean(r.lamp),curtain:Boolean(r.curtain)});
   activeRoomScene.setRoomActivity?.({night:n,jobs:j.items});
  }
  if(fittingScene&&!fittingScene.closest?.('[hidden]'))fittingScene.setRoomPaused?.(false);
  const nextJson=JSON.stringify(r);
  if(cachedRoomResult&&nextJson===cachedRoomJson)return cachedRoomResult;
  cachedRoomJson=nextJson;
  const result=[shell];
  cachedRoomResult=result;
  return result;
 }
 async function render(){
  document.body.classList?.toggle?.('room-wide',true);
  document.body.classList?.toggle?.('holo-deck',true);
  const version=++renderVersion;
  $('title').textContent='她的房间';
  $('eyebrow').textContent='ORBITAL VIEWPORT // WHALE HABITAT';
  updateHudTelemetry(latestNight);
  const paint=(...children)=>content.replaceChildren(...children);
  const prevRoomResult=cachedRoomResult,hasWarmRoom=Boolean(prevRoomResult);
  if(hasWarmRoom){
   paint(...prevRoomResult);
   activeRoomScene?.setRoomPaused?.(false);
   if(fittingScene&&!fittingScene.closest?.('[hidden]'))fittingScene.setRoomPaused?.(false);
  }else{
   paint(div('empty loading','正在开启全息视窗…'));
  }
  try{
   const result=await room();
   if(version!==renderVersion)return;
   if(!(hasWarmRoom&&result===prevRoomResult))paint(...result);
   panelRevision=revision||roomRevision;
   $('updated').textContent='更新于 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
  }catch(e){
   if(version!==renderVersion)return;
   cachedRoomShell=null;cachedRoomResult=null;cachedRoomJson='';cachedRoomIdentity='';roomDispose();roomDispose=()=>{};
   paint(div('errorbox',e.message),actions(button('重新连接',render,'quiet')));
   $('updated').textContent='读取失败';
  }
 }
 $('refresh').addEventListener('click',()=>{if(roomWorkspace?.isOpen?.())return roomWorkspace.refresh(true);invalidateReadCache(true);prefetchedRoom=null;return render();});
 render();
})();
