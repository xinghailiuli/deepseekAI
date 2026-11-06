// Furniture owns its presentation; data continues to live in the existing services.
export function createRoomWorkspace({document:doc,request,store={},customViews={},onClose}={}) {
 const drafts=store.drafts??=new Map(),filters=store.filters??={},selected=store.selected??={},tabs=store.tabs??={};
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const add=(n,...children)=>{for(const c of children.flat(Infinity))if(c!=null)n.append(c);return n;};
 const box=(cls,...children)=>add(el('div',null,cls),children);
 const text=(s,cls='ws-copy')=>el('p',s,cls);
 const small=s=>text(s,'ws-small');
 const localTime=value=>value?new Date(value).toLocaleString(undefined,{hour12:false}):'尚无记录';
 const scopeName=s=>String(s||'').replace(/^private:/,'私聊 · ').replace(/^group:/,'群聊 · ');
 const tag=s=>el('span',s,'ws-tag');
 const detail=(name,...children)=>add(el('details',null,'ws-details'),el('summary',name),children);
 const json=value=>el('pre',JSON.stringify(value??{},null,2),'ws-json');
 const dialog=el('dialog',null,'room-workspace');dialog.setAttribute('aria-modal','true');
 doc.body.append(dialog);
 let kind='',view='',mode='',epoch=0,opened=false,disposed=false,trigger=null,writeBusy=false,clockTimer=null,body,status,nav;
 const names={computer:'琉璃的电脑',comms:'全息通讯视窗',workbench:'工坊与舱室中枢',enchant:'附魔台上的日记',bed:'床边的长夜'};
 const meta={
  computer:['◈','LIULI OS // MEMORY · PERSONA · RELATIONS','●  LIULI NEURAL ARCHIVE'],
  comms:['◉','ORBITAL COMMS // TELEMETRY · QQ · PROACTIVE','◉  COMMS LINK SYNCHRONIZED'],
  workbench:['⌘','HABITAT BAY // TOOLS · CABIN · SYSTEM','⌘  WORKSHOP CORE READY'],
  enchant:['✧','HOLO JOURNAL // 留给自己的日常','✦  每一页都是陪伴'],
  bed:['☾','STARLIGHT BERTH // GOOD NIGHT · DREAMS','☾  愿今夜安稳']
 };
 const pages={
  computer:[['memory','记忆档案','▤'],['persona','人格档案','◇'],...(customViews.relations?[['relations','关系与画像','♧']]:[])],
  comms:[['overview','近况遥测','◉'],['qq','QQ 与空间','◎'],['proactive','主动联系','↗'],['expression','表达与感知','≋']],
  workbench:[['tools','能力工具箱','⌘'],['decor','舱室与物品','⌂'],['system','系统与备份','⚙'],['about','航行铭牌','·']],
  enchant:[['read','翻阅日记','▧'],['write','写一页','✎'],['generate','请她写一篇','✧']],
  bed:[['night','今夜','☾'],['dreams','梦的收藏','✦']]
 };
 const alive=token=>opened&&!disposed&&token===epoch;
 const announce=(message,error=false)=>{if(!opened)return;status.textContent=message;status.className='ws-notice'+(error?' is-error':'');};
 const button=(label,fn,cls='ws-button',aria)=>{const b=el('button',label,cls);b.type='button';if(aria)b.setAttribute('aria-label',aria);b.addEventListener('click',async event=>{event.preventDefault();if(b.disabled)return;const token=epoch;b.disabled=true;try{await fn();}catch(e){if(alive(token))announce(e.message||String(e),true);}finally{b.disabled=false;}});return b;};
 const section=(title,...children)=>add(el('section',null,'ws-section'),title?el('h3',title):null,children);
 const row=(...children)=>box('ws-actions',children);
 function makeForm(key,specs,submit,label='保存',baseline=null) {
  const form=el('form',null,'ws-form'),fields=[],cached=drafts.get(key);
  const current=()=>drafts.get(key)||{baseline};
  const stale=()=>{const old=current().baseline;return baseline&&old&&(baseline.revision>old.revision||(baseline.revision>=old.revision&&baseline.etag!==old.etag));};
  if(stale()){
   const conflict=box('ws-draft-conflict',text('这份草稿基于旧版本。请核对当前内容，再继续编辑。'),detail('查看当前保存的内容',specs.map(([,label,value])=>section(label,text(value)))));
   conflict.append(button('已核对，继续编辑这份草稿',()=>{if(writeBusy)throw Error('上一项操作还在处理，请稍候。');if(stale())drafts.set(key,{values:values(),baseline});conflict.remove();},'ws-button'));
   form.append(conflict);
  }
  for(const [name,label,value='',type='text',options=[]] of specs){
   const wrapper=el('label',null,'ws-field'+(type==='textarea'?' is-wide':'')+(type==='checkbox'?' is-check':''));
   let input;if(type==='textarea')input=el('textarea');else if(type==='select'){input=el('select');for(const [v,t]of options){const o=el('option',t);o.value=v;input.append(o);}}else{input=el('input');input.type=type;}
   input.name=name;const initial=cached&&Object.hasOwn(cached.values,name)?cached.values[name]:value;
   if(type==='checkbox')input.checked=Boolean(initial);else input.value=initial??'';
   if(type==='number'){input.min='0';input.step='any';}
   add(wrapper,el('span',label),input);form.append(wrapper);fields.push({name,input,type});
  }
  const values=()=>Object.fromEntries(fields.map(({name,input,type})=>[name,type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value]));
  const remember=()=>{const draft={values:values(),baseline:current().baseline};drafts.set(key,draft);return draft;};
  form.addEventListener('input',remember);
  const run=()=>{if(!form.reportValidity())return;if(stale())throw Error('当前内容已有变化，请先核对版本；草稿仍然保留。');const draft=remember();return submit(draft.values,key,draft.baseline);};
  const save=button(label,run,'ws-button is-primary');form.append(row(save));
  form.addEventListener('submit',async e=>{e.preventDefault();if(save.disabled||!form.reportValidity())return;save.disabled=true;const token=epoch;try{await run();}catch(error){if(alive(token))announce(error.message||String(error),true);}finally{save.disabled=false;}});
  return form;
 }
 const scope=(value='')=>['scope','会话 · private:QQ号 / group:群号',value];
 async function write(action,payload,revision,key){
  if(writeBusy)throw Error('上一项操作还在处理，请稍候。');
  const token=epoch,draft=key?drafts.get(key):undefined;writeBusy=true;
  try{
   const result=await request(action,payload,revision);
   const unchanged=!key||drafts.get(key)===draft;
   if(key&&unchanged)drafts.delete(key);
   else if(key&&draft&&drafts.get(key)?.baseline===draft.baseline){
    // Only our own receipt can advance an in-flight draft. A later read must not.
    const current=drafts.get(key),next={...draft.baseline,revision:result.revision};
    if(action==='/persona/save'&&result.data?.etag)next.etag=result.data.etag;
    if(action==='/settings/save'&&result.data)next.config=result.data;
    current.baseline=next;
   }
   if(alive(token)){if(unchanged)await draw();announce(result.data?.status==='queued'?'已经排队，完成后可刷新查看。':unchanged?'已保存。':'已保存提交的内容，后来编辑的草稿仍保留。');}
   return result.data;
  }finally{writeBusy=false;}
 }
 const switchView=async next=>{view=next;tabs[kind]=view;mode='';await draw();};
 const switchMode=async next=>{mode=next;await draw();};
 function drawNav(){nav.replaceChildren();for(const [id,label,icon]of pages[kind]){const b=button('',()=>switchView(id),'ws-app');b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(view===id));add(b,el('span',icon,'ws-app-icon'),el('span',label));nav.append(b);}}
 function filterPanel(key,specs){return detail('查找与筛选',makeForm('filter:'+key,specs,async data=>{filters[key]={...data,page:1};selected[key]=null;await draw();},'查找'));}
 function pager(data,key){return box('ws-pagination',button('上一页',async()=>{if((data.page||1)<=1)return;filters[key]={...filters[key],page:data.page-1};selected[key]=null;await draw();}),small(`第 ${data.page||1} 页 · 共 ${data.total||0} 条`),button('下一页',async()=>{if((data.page||1)*(data.limit||30)>=data.total)return;filters[key]={...filters[key],page:(data.page||1)+1};selected[key]=null;await draw();}));}
 function pick(data,key){const item=selected[key]?.edge==='last'?data.items.at(-1):data.items.find(x=>x.id===selected[key])||data.items[0];if(item)selected[key]=item.id;return item;}
 function memorySpecs(r={},f={}){return [...(!r.id?[scope(f.scope),['subject','主体 QQ 号',f.subject||'']]:[]),['content','记忆正文',r.content||'','textarea'],['level','等级 · 0 不遗忘，最高 5',r.level??3,'number'],...(!r.id?[['attribute','属性（可选）',''],['value','属性值（可选）','']]:[])];}
 async function computer(token){
  if(view==='persona'){
   const snap=await request('/persona',{});if(!alive(token))return;
   const d=snap.data,tabBar=row(...[['','编辑档案'],['preview','注入预览'],['history','历史版本']].map(([id,label])=>button(label,()=>switchMode(id),'ws-button'+(mode===id?' is-selected':''))));
   const heading=box('ws-document-heading',tag('PERSONA'),el('h2',d.name||'琉璃'),small('每一段文字，都组成你熟悉的她。'));
   let page;
   if(mode==='history')page=section('历史版本',(d.history||[]).length?[...d.history].reverse().map(r=>box('ws-history-item',el('strong',r.name||'人格版本'),small(localTime(r.at)),button('恢复这一版',()=>write('/persona/rollback',{id:r.id,etag:d.etag},snap.revision)))):small('还没有面板保存记录。'));
   else if(mode==='preview')page=section('实际注入预览',text(typeof d.preview==='string'?d.preview:JSON.stringify(d.preview)),detail('分代小节',json(d.sections)));
   else page=makeForm('persona:edit:'+d.name,[['content','人格全文',d.content,'textarea']],(b,key,base)=>write('/persona/save',{name:base.name,content:b.content,etag:base.etag},base.revision,key),'保存人格',{revision:snap.revision,name:d.name,etag:d.etag});
   return box('ws-editor',heading,tabBar,page,small('草稿会保留；保存时核对当前人格文件版本。'));
  }
  const f=filters.memory||{},snap=await request('/memory/list',f);if(!alive(token))return;const d=snap.data,item=pick(d,'memory');
  const files=box('ws-file-list',box('ws-list-heading',el('strong','记忆档案'),tag(d.total??d.items.length)),d.items.length?d.items.map(r=>{const b=button('',async()=>{selected.memory=r.id;mode='';await draw();},'ws-file'+(item?.id===r.id?' is-selected':''));return add(b,el('span','▤','ws-file-icon'),box('',el('strong',r.content.slice(0,28)),small(`${r.scope} · ${r.status==='conflict'?'待核对':r.status==='archived'?'归档':'有效'}`)));}):small('这里还没有记忆。'),pager(d,'memory'));
  let document;
  if(mode==='new')document=section('记住一件新的事',makeForm('memory:new',memorySpecs({},f),(b,key,base)=>write('/memory/update',b,base.revision,key),'保存记忆',{revision:snap.revision}));
  else if(mode==='library'){const original=await request('/memory/library',{});if(!alive(token))return;document=section('原有笔记库',small('保留原来的笔记和会话边界。'),json(original.data));}
  else if(item){
   const r=item;document=box('ws-memory-paper',box('ws-document-heading',tag('MEMORY / '+(r.level??3)),el('h2',scopeName(r.scope)||'一段记忆'),small(`主体 ${r.subject} · ${localTime(r.createdAt)}`)),mode==='edit'?makeForm('memory:'+r.id,memorySpecs(r),(b,key,base)=>write('/memory/update',{id:base.id,...b},base.revision,key),'保存记忆',{revision:snap.revision,id:r.id}):text(r.content,'ws-reading'),row(button(mode==='edit'?'返回阅读':'编辑这条记忆',()=>switchMode(mode==='edit'?'':'edit')),button(r.status==='archived'?'恢复这条记忆':'归档',()=>write('/memory/delete',{id:r.id,restore:r.status==='archived'},snap.revision))),r.status==='conflict'?section('核对这条事实',makeForm('conflict:'+r.id,[['supersedes','替代的旧记录 ID',r.conflicts?.[0]||'']],(b,key,base)=>write('/memory/update',{id:base.id,status:'active',...b},base.revision,key),'确认新事实',{revision:snap.revision,id:r.id})):null,detail('来源与修订',small(`来源 ${r.sourceId||'—'} · 强度 ${Number(r.strength||0).toFixed(2)}`),json({source:r.sourceRef,evidence:r.evidence,supersedes:r.supersedes,conflicts:r.conflicts})));
  }else document=box('ws-blank',el('span','▤','ws-empty-icon'),el('h2','把值得记住的事，放在这里。'),small('你可以新建一条记忆，也可以等待真实对话中的积累。'));
  return box('ws-memory-app',box('ws-toolbar',el('span','琉璃 / 记忆档案','ws-address'),button('新建记忆',()=>switchMode('new')),button('原有笔记库',()=>switchMode('library'))),filterPanel('memory',[scope(f.scope),['subject','主体 QQ 号',f.subject||''],['query','关键词',f.query||''],['status','状态',f.status||'','select',[['','全部'],['active','有效'],['conflict','待核对'],['archived','归档']]]]),box('ws-explorer',files,box('ws-document',document)));
 }
 async function diary(token){
  const f=filters.diary||{},snap=await request('/diary/list',f);if(!alive(token))return;const d=snap.data,item=pick(d,'diary');
  const index=box('ws-book-index',el('span','LIULI’S JOURNAL','ws-eyebrow'),el('h2','日子，慢慢写'),small('翻开一页，就回到那一天。'),filterPanel('diary',[['date','日期',f.date||'','date'],['query','关键词',f.query||''],['hidden','包括收起的篇目',f.hidden||false,'checkbox']]),box('ws-book-entries',d.items.map((r,i)=>{const b=button('',async()=>{selected.diary=r.id;view='read';tabs.enchant=view;mode='';await draw();},'ws-book-entry'+(r.id===item?.id?' is-selected':''));return add(b,el('span',String(((d.page||1)-1)*(d.limit||30)+i+1).padStart(2,'0'),'ws-entry-number'),box('',el('strong',r.time||'未标日期'),small(r.content.slice(0,36))),r.pinned?el('span','✦'):null);})),pager(d,'diary'));
  let sheet;
  if(mode==='export')sheet=section('把这些日子带走',small('Markdown 文本，可以全选复制。'),(()=>{const t=el('textarea',null,'ws-export');t.value=store.diaryExport||'';t.readOnly=true;t.setAttribute('aria-label','导出的日记');return t;})());
  else if(view==='write')sheet=box('',el('span','DEAR DIARY','ws-eyebrow'),el('h2','写下此刻'),makeForm('diary:write',[['mood','今天的心情',''],['content','想留在纸上的话','','textarea']],(b,key,base)=>write('/diary/write',b,base.revision,key),'保存这一页',{revision:snap.revision}));
  else if(view==='generate')sheet=box('',el('span','A LETTER TO MYSELF','ws-eyebrow'),el('h2','请琉璃写一篇'),small('选择这段回忆来自的会话，也可以留一点写作素材。'),makeForm('diary:generate',[scope(),['note','留给她的素材（可选）','','textarea']],(b,key,base)=>write('/diary/generate',b,base.revision,key),'开始写日记',{revision:snap.revision}));
  else if(item){const r=item,i=d.items.indexOf(r);const turn=async delta=>{const next=d.items[i+delta];if(next){selected.diary=next.id;await draw();}else if(delta>0&&d.page*d.limit<d.total){filters.diary={...f,page:d.page+1};selected.diary=null;await draw();}else if(delta<0&&d.page>1){filters.diary={...f,page:d.page-1};selected.diary={edge:'last'};await draw();}};
   sheet=box('',box('ws-paper-date',el('span',r.time||'某一天'),tag(r.mood||'一段日常')),text(r.content,'ws-diary-reading'),row(button(r.pinned?'取消收藏':'收藏',()=>write('/diary/pin',{id:r.id,pinned:!r.pinned},snap.revision)),button(r.hidden?'恢复显示':'收起这一篇',()=>write('/diary/delete',{id:r.id,restore:r.hidden},snap.revision))),box('ws-page-turn',button('上一篇',()=>turn(-1)),small(`${(d.page-1)*d.limit+i+1} / ${d.total}`),button('下一篇',()=>turn(1))));
  }else sheet=box('ws-blank',el('span','✎','ws-empty-icon'),el('h2','这一页，等你落笔'),small('试着写一页，或调整左边的筛选。'));
  return box('ws-diary',box('ws-book',index,box('ws-paper',sheet)),row(button('导出日记',async()=>{const version=epoch,result=await request('/diary/export',f);if(!alive(version))return;store.diaryExport=result.data.text;mode='export';await draw();}),small('每一页保留在原来的日记里。')));
 }
 async function bed(token){
  if(view==='dreams'){
   const f=filters.dreams||{},snap=await request('/night/dreams',f);if(!alive(token))return;const d=snap.data,item=pick(d,'dreams');
   return box('ws-dreamscape',box('ws-dream-heading',el('span','DREAM ARCHIVE','ws-eyebrow'),el('h2','把梦里的光，留下来'),small('梦境来自回忆的想象，会和真实经历分开保存。')),filterPanel('dreams',[scope(f.scope),['query','关键词',f.query||''],['date','夜晚日期',f.date||'','date'],['archived','包括归档的梦',f.archived||false,'checkbox']]),box('ws-dream-layout',box('ws-dream-list',d.items.map(r=>{const b=button('',async()=>{selected.dreams=r.id;await draw();},'ws-dream-file'+(r.id===item?.id?' is-selected':''));return add(b,el('span','✧'),el('strong',localTime(r.at)),small(r.content.slice(0,35)));})),item?box('ws-dream-story',tag(item.manual?'手记的梦':'REM 梦境'),text(item.content,'ws-reading'),small(`${item.scope} · 强度 ${Number(item.strength||0).toFixed(2)} · ${item.source||''}`),row(button(item.pinned?'取消保留':'保留这个梦',()=>write('/night/dream/pin',{id:item.id,pinned:!item.pinned},snap.revision)),button(item.archived?'恢复':'归档',()=>write('/night/dream/delete',{id:item.id,restore:item.archived},snap.revision)))):box('ws-blank',el('span','☾','ws-empty-icon'),el('h2','今晚的梦还在路上'))),pager(d,'dreams'),detail('写下一段新梦',makeForm('dream:make',[scope(f.scope)],(b,key,base)=>write('/night/dream/make',b,base.revision,key),'生成梦境',{revision:snap.revision})));
  }
  const [state,settings,sessions]=await Promise.all([request('/night/state',{}),request('/settings',{}),request('/proactive/sessions',{})]);if(!alive(token))return;const d=state.data,config=settings.data.config;
  const stages={awake:'清醒时分',onset:'渐渐入睡',light:'浅浅的睡眠',deep:'安静的深睡',rem:'正在做梦'};
  const gauge=(label,value)=>{const progress=el('progress');progress.max=100;progress.value=value;progress.setAttribute('aria-label',label);return box('ws-gauge',box('ws-gauge-label',el('span',label),el('strong',Math.round(value)+' / 100')),progress);};
  const hero=box('ws-bed-hero',box('ws-moon',el('span','✦')),box('',el('span',stages[d.stage]||d.stage,'ws-eyebrow'),el('h2',d.sleeping?'晚安，做个温柔的梦。':'今晚，按自己的节奏。'),small(d.sleeping?`从 ${localTime(d.startedAt)} 开始休息 · 已尝试叫醒 ${d.attempts} 次`:'窗外的时间在走，小屋也有自己的日常。'),button(d.sleeping?'现在叫醒':'让她休息',()=>write(d.sleeping?'/night/wake':'/night/sleep',{},state.revision),'ws-button is-primary')));
  const controls=row(...[['','休息状态'],['settings','作息设置'],['unread','床头信笺']].map(([id,label])=>button(label,()=>switchMode(id),'ws-button'+(mode===id?' is-selected':''))));
  let panel;
  if(mode==='settings'){
   const labels={allowSleep:'允许自动入睡',sleepHour:'夜间开始（小时）',wakeHour:'自然醒来（小时）',wakePolicy:'消息叫醒范围',maxWakeAttempts:'累计叫醒次数上限',minSleepMinutes:'最短休息（分钟）',maxSleepHours:'最长休息（小时）',dreamEnabled:'REM 自动做梦'};
   panel=section('安排一个舒服的夜晚',makeForm('night:settings',Object.entries(config.night).map(([k,v])=>[k,labels[k]||k,v,k==='wakePolicy'?'select':typeof v==='boolean'?'checkbox':typeof v==='number'?'number':'text',k==='wakePolicy'?[['private','仅私聊'],['all','私聊和群聊'],['none','仅自然醒或手动叫醒']]:[]]),(b,key,base)=>write('/settings/save',{config:{...base.config,night:{...base.config.night,...b}}},base.revision,key),'保存作息',{revision:settings.revision,config}));
  }else if(mode==='unread'){
   const messages=box('ws-unread-output');panel=section('睡着时收到的信',Object.entries(d.unread||{}).length?Object.entries(d.unread).map(([scope,n])=>box('ws-mail',el('strong',scope),small(n+' 条未读'),button('查看未读',async()=>{const version=epoch,r=await request('/night/unread',{scope});if(alive(version))messages.replaceChildren(el('h3',scope),json(r.data));}))):small('床头还没有未读的信。'),messages,makeForm('night:crawl',[['scope','补读会话','','select',[['','全部已知会话'],...(sessions.data.conversations||[]).map(s=>[s.key,s.key])]]],(b,key,base)=>write('/night/crawl',b,base.revision,key),'补读已有消息',{revision:state.revision}));
  }else panel=section('睡眠足迹',(d.timeline||[]).length?box('ws-night-timeline',[...d.timeline].reverse().map(r=>box('ws-night-event',tag(r.type==='sleep'?'入睡':r.type==='wake'?'醒来':r.type),small(localTime(r.at))))):small('之后的入睡与醒来，会留在这里。'));
  return box('ws-bedside',hero,box('ws-gauges',gauge('精力',d.energy),gauge('心情',d.mood)),controls,panel);
 }
 async function draw(force=false){
  if(!opened||disposed)return;const token=++epoch;drawNav();body.setAttribute('aria-busy','true');
  const custom=customViews[view],warmNodes=!force?custom?.warm?.():null;
  if(warmNodes)body.replaceChildren(...warmNodes);
  else body.replaceChildren(box('ws-loading',el('span','◌'),text('正在打开…')));
  try{
   if(custom){
    const result=await custom({token,alive,announce,force,refresh:draw,openFurniture:(k,v)=>open(k,trigger,v)});
    if(!alive(token))return;
    const nodes=Array.isArray(result)?result:[result];
    if(!warmNodes||!['INPUT','TEXTAREA','SELECT'].includes(doc.activeElement?.tagName))body.replaceChildren(...nodes);
   }else{
    const result=await ({computer,enchant:diary,bed}[kind])(token);if(!alive(token))return;body.replaceChildren(result);
   }
  }
  catch(e){if(alive(token))body.replaceChildren(box('ws-failure',el('h2','暂时没有打开'),text(e.message||String(e)),button('重新读取',()=>draw(true))));}
  finally{if(alive(token))body.setAttribute('aria-busy','false');}
 }
 async function open(next,source,initialView){
  if(!pages[next]||disposed)return;const wasOpen=opened;kind=next;view=initialView||tabs[kind]||pages[kind][0][0];if(initialView)tabs[kind]=initialView;mode='';if(!wasOpen||source)trigger=source||doc.activeElement;opened=true;
  const info=meta[kind]||['◈','ORBITAL CONSOLE','●  ONLINE'];
  dialog.className='room-workspace ws-'+kind;dialog.setAttribute('data-workspace',kind);dialog.setAttribute('aria-label',names[kind]);
  const closeButton=button('回到小屋',close,'ws-close');
  const top=box('ws-topbar',box('ws-title',el('span',info[0],'ws-title-icon'),box('',el('strong',names[kind]),small(info[1]))),row(button('刷新',()=>draw(true),'ws-refresh'),closeButton));
  nav=el('nav',null,'ws-apps');nav.setAttribute('aria-label','家具功能');body=box('ws-body');status=box('ws-notice');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const formatClock=()=>new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false});
  const clockNode=el('time',formatClock());
  if(clockTimer!=null)doc.defaultView?.clearInterval?.(clockTimer);
  clockTimer=doc.defaultView?.setInterval?.(()=>{if(opened)clockNode.textContent=formatClock();},15000)??null;
  dialog.replaceChildren(box('ws-device',top,box('ws-desktop',nav,body),status,box('ws-chin',el('span',info[2]),clockNode)));
  if(!dialog.open)dialog.showModal();closeButton.focus();await draw();
 }
 function close(){if(clockTimer!=null){doc.defaultView?.clearInterval?.(clockTimer);clockTimer=null;}if(!opened)return;opened=false;++epoch;dialog.close();if(trigger?.isConnected)trigger.focus();onClose?.();}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button,input,textarea,select,summary,a[href],[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length&&doc.defaultView?.getComputedStyle(n).visibility!=='hidden');
  const first=controls[0],last=controls.at(-1);
  if(first&&((event.shiftKey&&doc.activeElement===first)||(!event.shiftKey&&doc.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
 });
 return {element:dialog,open,close,refresh:draw,announce,current:()=>({kind,view}),isOpen:()=>opened,destroy(){close();disposed=true;dialog.remove();}};
}
