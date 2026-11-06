import {roomActivity,roomWalkPoint} from './room-life.mjs';
import {createRoomJourney} from './room-journey.mjs';
import {roomNavigation,chooseRoomWander} from './room-navigation.mjs';
import {createRoomChoreography} from './room-choreography.mjs';
import {createRoomLifeDefinitions,roomSleepVariation} from './room-life-sequences.mjs';
import {createRoomLifeArt,validateRoomLifeAssets,createRoomQuilt} from './room-life-art.mjs';
import {createRoomWardrobe} from './room-wardrobe.mjs';
import {createRoomDaylight} from './room-daylight.mjs';
import {createRoomIdleEvents} from './room-idle-events.mjs';
import {transitionWindow} from './room-pose-transition.mjs';
import {createRoomDiagnostics,createRoomFrameGuard,roomResourceDeadline} from './room-diagnostics.mjs';
let roomArtSerial=0;
const roomDecodedLifeUrls=new Map(),roomDecodingLifeUrls=new Map();
function decodeRoomLifeUrl(url,ImageClass=globalThis.Image){
 if(roomDecodedLifeUrls.has(url))return Promise.resolve(url);
 if(roomDecodingLifeUrls.has(url))return roomDecodingLifeUrls.get(url);
 const p=(async()=>{
  if(!ImageClass)throw Error('No image decoder');
  const img=new ImageClass();
  if(typeof img.decode==='function'){img.src=url;await img.decode();}
  else{await new Promise((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Image load failed'));img.src=url;});}
  roomDecodedLifeUrls.set(url,img);
  return url;
 })().finally(()=>roomDecodingLifeUrls.delete(url));
 roomDecodingLifeUrls.set(url,p);
 return p;
}
export async function prewarmRoomLifeAssets(assets,ImageClass=globalThis.Image){
 if(!assets||!ImageClass||!validateRoomLifeAssets(assets))return;
 const urls=Object.values({...assets.atlases,greenhouse:assets.greenhouse,...Object.fromEntries(['bedding','mattress','foldedQuilt','chairCleanplate'].filter(k=>assets[k]).map(k=>[k,assets[k]])),...(assets.quilt?{quilt:assets.quilt.url}:{})});
 for(let i=0;i<urls.length;i+=3){
  await Promise.all(urls.slice(i,i+3).map(u=>decodeRoomLifeUrl(u,ImageClass).catch(()=>{})));
  await new Promise(r=>typeof setTimeout==='function'?setTimeout(r,8):r());
 }
}

// The illustrated theme is tied to the original furniture set. Changed rooms
// continue to use individually rendered objects, never a stale baked inventory.
export function createArtBlockRoom(room,{document:doc,petAssets={},actionAssets={},animation={},night={},jobs=[],preview='auto',onActivity,onFloor,onLamp,onCurtain,onFurniture,onDiagnostic}={}){
 const house=actionAssets.house,names=['床','书桌','台灯','窗','沙发','冰箱','电视','绿萝','旧相册','日记本','记事本','床头柜','书架','椅子','电脑','茶几','挂画','挂钟','盆栽'];
 if(!house||room.items?.length!==names.length||!names.every(name=>room.items.some(item=>item.name===name)))return null;
 const instance='room-view-'+(++roomArtSerial)+'-';
 const el=(tag,attrs={},text)=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,k==='id'?instance+v:typeof v==='string'?v.replace(/url\(#([^\)]+)\)/g,(_,id)=>'url(#'+instance+id+')'):v);if(text!==undefined)n.textContent=text;return n;};
 const svg=el('svg',{viewBox:'0 1080 1536 1024',class:'room-scene block-room room-art',role:'group','aria-label':'琉璃的小鲸鱼双层小屋，精细橡木与白桦木房间','data-room-art':'reference-v4','data-room-size':'14x10','data-room-floors':'2'});
 const diagnostics=createRoomDiagnostics({onEvent:onDiagnostic});let renderFailed=false,lastGoodRuntime=null,lastPose='',drawFailures=0,snapshotDirty=true;
 const guard=createRoomFrameGuard({root:svg,onError:error=>{renderFailed=true;drawFailures++;svg.setAttribute('data-room-render-error',error.message||String(error));diagnostics.record('draw-error',{mode:currentMode,pose:lifeSample?.pose,outfit:svg.getAttribute?.('data-room-outfit')||'original',error:error.message||String(error),stack:error.stack});}});
 svg.getRoomDiagnostics=()=>diagnostics.snapshot();
 svg.recordRoomDiagnostic=(kind,data)=>diagnostics.record(kind,data);
 svg.append(el('title',{},'琉璃的小鲸鱼双层小屋 · 一楼起居与生产，二楼休息与魔法'));
 const defs=el('defs');svg.append(defs);
 const offsets={1:1080,2:0},floors={},poses={},frames={},hitPoints={walk:[970,450],...Object.fromEntries(Object.entries(house.actions).map(([k,v])=>[k,v.head]))};
 const image=(url,attrs={})=>{const isBrowser=Boolean(doc.defaultView),href=(isBrowser&&typeof url==='string'&&url.startsWith('/plugins/'))?undefined:url;const picture=el('image',{x:0,y:0,width:house.width,height:house.height,...(href?{href}:{}),preserveAspectRatio:'none',...attrs});if(isBrowser&&url&&!href)picture.setAttribute('data-fallback-href',url);picture.addEventListener('error',()=>diagnostics.record('asset-error',{asset:'scene-image',stage:'svg-load'}));return picture;};
 const clip=(id,rect)=>{const c=el('clipPath',{id,clipPathUnits:'userSpaceOnUse'});c.append(typeof rect==='string'?el('polygon',{points:rect}):el('rect',{x:rect[0],y:rect[1],width:rect[2],height:rect[3]}));defs.append(c);return `url(#${id})`;};
  const artPictures=[],ambientWindows=[];
 const floorArt=(g,level)=>{const basePic=image(house.floors[level]);g.append(basePic);artPictures.push([basePic,level===1?'floor-one':'floor-two']);const repair=house.repairs?.[level];if(repair){const id='room-repair-alpha-'+level+'-'+defs.children.length,mask=el('mask',{id,maskUnits:'userSpaceOnUse',x:0,y:0,width:house.width,height:house.height,style:'mask-type:alpha'});const maskPic=image(house.floors[level]);mask.append(maskPic);artPictures.push([maskPic,level===1?'floor-one':'floor-two']);defs.append(mask);const patch=el('g',{'clip-path':clip('room-repair-'+level+'-'+defs.children.length,repair.clip),mask:'url(#'+id+')'});const picture=image(repair.url);patch.append(picture);artPictures.push([picture,level===1?'floor-one':'floor-two']);g.append(patch);}if(level===1){const daylight=createRoomDaylight({document:doc,defs,parent:g,owner:svg,source:house.repairs?.[1]?.url||house.floors[1],now:animation.wallClock,schedule:animation.scheduleWallClock,cancel:animation.cancelWallClock});ambientWindows.push(daylight);artPictures.push([daylight.picture,'floor-one']);}};
 for(const level of[2,1]){const g=el('g',{'data-house-floor':level,transform:`translate(0,${offsets[level]})`});floorArt(g,level);svg.append(g);floors[level]=g;}
 const mirrorPatch=el('g',{'data-room-mirror':'v12','clip-path':clip('room-mirror-v12',[685,171,121,169]),'pointer-events':'none',display:house.mirror?'inline':'none'}),mirrorPicture=image(house.mirror);
 mirrorPatch.append(mirrorPicture);floors[2].append(mirrorPatch);mirrorPicture.addEventListener('error',()=>mirrorPatch.setAttribute('display','none'));
 // Saved identities remain inspectable; the artwork is only their presentation.
 const upper=new Set(['床','床头柜','书架','盆栽','挂画']);
 for(const item of room.items){const level=upper.has(item.name)?2:1,g=el('g',{'data-room-item':item.id,'data-object-floor':level});g.append(el('title',{},`${item.name}${item.state?' · '+item.state:''}`));floors[level].append(g);}
 const extraActions=[['read','书架翻书'],['enchant','附魔练习'],['garden','照料小麦'],['rest','露台歇脚']];
 const vector=(value,length)=>Array.isArray(value)&&value.length===length&&value.every(Number.isFinite);
 const upstairs=extraActions.every(([mode])=>{const a=house.actions[mode];return a?.floor===2&&Array.isArray(a.frames)&&a.frames.length>0&&a.frames.every(url=>typeof url==='string'&&url.length>0)&&vector(a.clip,4)&&a.clip[2]>0&&a.clip[3]>0&&vector(a.head,2)&&vector(a.feet,2);});
 const failedActions=new Set(),hotspots={};
 svg.roomActions=upstairs?extraActions:[];
 const activityAt=time=>{const a=roomActivity(room,visual.night,visual.jobs,visual.preview,time,{upstairs});return failedActions.has(a.mode)?roomActivity(room,visual.night,visual.jobs,'auto',time):a;};
 const leisureDwell={walk:60000,lounge:150000,garden:120000,type:150000,write:150000,read:100000,enchant:80000,rest:120000,sleep:180000};
 let visual={night,jobs,preview},elapsed=0,frameAt=null,motionTime=0,floor='1',detail=false,currentMode=null,lastSource=null,patUntil=0,patStarted=0,pausedWalk=false,journey=null,travelling=false,lastNotice='',residentLevel='1',follow=true,departure=null,lifeClock=0,lastPaint=0,route=null,camera=null,previousPortal=null,wanderUntil=0;
 const requestFrame=animation.requestFrame||globalThis.requestAnimationFrame?.bind(globalThis),reduced=animation.reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
 let sleepStarted=0,quiltCover=0,sleepSeed=animation.sleepSeed??Math.floor(Math.random()*1000000);
 const idleEvents=createRoomIdleEvents(animation.random||Math.random);let idleSample=null;
 let life=null,lifeArt=null,lifeMode=null,lifeExit=false,lifeNeedsEntry=false,lifeChairEntry=false,lifeSample=null,lifeLoad=0,lifeAssets=null,lifeLoading=false;
 const lifeScenery=el('g',{'data-life-scenery':10,display:'none'});floors[2].append(lifeScenery);
 const chairFeather=el('filter',{id:'chair-feather',x:'-10%',y:'-10%',width:'120%',height:'120%'});chairFeather.append(el('feGaussianBlur',{stdDeviation:3}));defs.append(chairFeather);
 const chairMask=el('mask',{id:'chair-mask',maskUnits:'userSpaceOnUse',x:825,y:338,width:172,height:219});chairMask.append(el('rect',{x:835,y:348,width:152,height:199,fill:'white',filter:'url(#chair-feather)'}));defs.append(chairMask);
 const chairErase=el('g',{'data-chair-surface':'v20',display:'none',mask:'url(#chair-mask)'}),chairEraseImage=image();chairErase.append(chairEraseImage);floors[1].append(chairErase);
 const bedSurface=el('g',{'data-bed-surface':'v20',display:'none','clip-path':clip('bed-surface-v20','263,594 464,555 555,689 553,738 342,756 297,665')}),bedSurfaceImage=image();bedSurface.append(bedSurfaceImage);floors[2].append(bedSurface);
 const bedSheet=el('g',{'data-bed-sheet':'v20',display:'none','clip-path':clip('bed-sheet-v20','263,594 464,555 555,689 553,738 342,756 297,665')}),bedSheetImage=image();bedSheet.append(bedSheetImage);floors[2].append(bedSheet);
 const gardenPatch=el('g',{'clip-path':clip('room-life-garden','879,246 1266,202 1342,446 1322,551 927,584 879,489')}),gardenPicture=image();gardenPatch.append(gardenPicture);lifeScenery.append(gardenPatch);
 const bench=el('g',{'data-life-bench':true});lifeScenery.append(bench);
 for(const [points,fill]of [['1086,657 1160,644 1201,665 1127,680','#c38c53'],['1127,680 1201,665 1201,675 1127,691','#87552e'],['1086,657 1127,680 1127,691 1086,668','#a66b36'],['1096,668 1108,675 1108,711 1096,705','#704522'],['1180,675 1191,672 1191,707 1180,711','#704522']])bench.append(el('polygon',{points,fill,stroke:'#704b2b','stroke-width':1}));
 const writingPaper=el('g',{'data-life-paper':true,display:'none'});writingPaper.append(el('polygon',{points:'848,377 889,371 906,390 864,397',fill:'#fff6df',stroke:'#d6c29a','stroke-width':1}));floors[1].append(writingPaper);
 for(let i=0;i<3;i++)writingPaper.append(el('path',{d:`M${858+i*3},${381+i*3} l24,-3`,stroke:'#99a4af','stroke-width':.6}));
 const cupRest=el('g',{'data-life-cup':true});cupRest.append(el('ellipse',{cx:1182,cy:661,rx:8,ry:3,fill:'#634527',opacity:.25}),el('path',{d:'M1177,650 h10 l-1,10 q-4,3 -8,0 Z M1187,651 q8,-1 6,6 l-6,1',fill:'#609bc1',stroke:'#315d7d','stroke-width':1.2}),el('ellipse',{cx:1182,cy:650,rx:5,ry:2,fill:'#422e20'}));lifeScenery.append(cupRest);
 cupRest.setAttribute('transform','translate(-94,4)');
 const portal=el('g',{'data-stair-handoff':true,display:'none','pointer-events':'none'}),portalFloors={};for(const level of[1,2]){const g=el('g');floorArt(g,level);portal.append(g);portalFloors[level]=g;}svg.append(portal);
 const resident=el('g',{'data-room-resident':'dafeiyu',class:'room-resident'});svg.append(resident);
 // Contact patches include the real chair front/desk/duvet in their original
// coordinates. Never float a front-facing upper body over a back-facing desk.
 for(const[mode,asset]of Object.entries(house.actions)){
  if(extraActions.some(([m])=>m===mode)&&!upstairs)continue;
  const g=el('g',{'data-room-pose':mode,'data-resident-floor':asset.floor,'data-contact':asset.contact,transform:`translate(${asset.offset?.[0]||0},${offsets[asset.floor]+(asset.offset?.[1]||0)})`});
  if(mode==='read')g.append(el('ellipse',{cx:736,cy:544,rx:22,ry:5,fill:'#493824',opacity:'.16'}));
  const region=el('g',{'clip-path':clip('room-art-'+mode,asset.shape||asset.clip)}),base=image(asset.frames[0]);region.append(base);if(mode==='garden')artPictures.push([base,'garden']);g.append(region);resident.append(g);poses[mode]=g;
  if(extraActions.some(([m])=>m===mode))base.addEventListener('error',()=>{
   failedActions.add(mode);svg.roomActions=extraActions.filter(([m])=>!failedActions.has(m));
   if(mode!=='enchant'||!onFurniture){hotspots[mode]?.setAttribute('aria-disabled','true');hotspots[mode]?.setAttribute('tabindex','-1');}
   if(visual.preview===mode)visual.preview='auto';lastNotice='';paint(elapsed);
  });
  if(asset.frames.length>1){
   const handRect=mode==='type'?[832,365,48,31]:[830,369,48,39],hand=el('g',{'clip-path':clip('room-art-'+mode+'-hands',handRect),opacity:0,'data-contact-animation':mode}),alternate=image(undefined);hand.append(alternate);g.append(hand);frames[mode]={hand,alternate,asset};
  }
 }
 const walkPose=el('g',{'data-room-pose':'walk','data-resident-floor':1});resident.append(walkPose);poses.walk=walkPose;
 walkPose.append(el('ellipse',{cx:0,cy:1,rx:23,ry:6,fill:'#493824',opacity:'.22'}));
 const walkAsset=actionAssets.walk,isBrowser=Boolean(doc.defaultView),walkHref=(isBrowser&&typeof walkAsset.url==='string'&&walkAsset.url.startsWith('/plugins/'))?undefined:walkAsset.url;
 const walkSheet=el('svg',{x:-107.8,y:-186.1,width:184,height:189.8,viewBox:walkAsset.frames[0].join(' '),overflow:'hidden','data-complete-action':'walk'});const walkPic=el('image',{...(walkHref?{href:walkHref}:{}),x:0,y:0,width:walkAsset.width,height:walkAsset.height});if(isBrowser&&walkAsset.url&&!walkHref)walkPic.setAttribute('data-fallback-href',walkAsset.url);walkSheet.append(walkPic);walkPose.append(walkSheet);
 const standing=el('image',{x:-285*219.5/412,y:-285*344/412+9.7,width:285,height:285*344/412,preserveAspectRatio:'xMidYMax meet','data-walk-pose':'standing'});walkPose.append(standing);
 const lifeRoot=el('g',{'data-life-actor':true});resident.append(lifeRoot);
 const wardrobe=createRoomWardrobe({document:doc,root:resident});
 // Foreground clips follow the actual furniture silhouette. A rectangle of
 // floor pixels must never erase the resident's body above a fence.
 const occluders=[];
 const foreground=(name,level,polygons,when,url)=>{const c=el('clipPath',{id:'room-front-'+name,clipPathUnits:'userSpaceOnUse'});for(const points of polygons)c.append(el('polygon',{points}));defs.append(c);const g=el('g',{'data-room-foreground':name,'clip-path':`url(#room-front-${name})`,transform:`translate(0,${offsets[level]})`,'pointer-events':'none',display:'none'}),picture=image(url||house.floors[level]);g.append(picture);(name==='wardrobe-quilt'?svg:resident).append(g);if(url&&url===house.repairs?.[level]?.url)artPictures.push([picture,level===1?'floor-one':'floor-two']);occluders.push({g,level,when,name,picture});};
 foreground('sofa',1,['680,578 746,554 789,543 823,541 884,653 929,720 925,768 787,807 735,756 680,626'],p=>p.x>620&&p.x<965&&p.y<640);
  foreground('chair',1,[
   '888,377 948,369 972,400 975,473 956,495 913,489 882,468 881,427',
   '847,426 864,420 881,432 880,443 864,440 866,476 855,474 851,444',
   '913,489 936,489 959,527 944,535 925,510 902,539 886,536 891,516'
  ],p=>p.x>790&&p.x<995&&p.y<521);
 foreground('lower-rail',1,['1128,446 1155,437 1230,526 1229,578 1201,586 1127,512'],p=>p.x>1165&&p.y<650,house.repairs?.[1]?.url);
 foreground('entry-lantern',1,['1118,763 1145,749 1168,769 1167,835 1143,850 1119,832'],p=>p.x>1085&&p.y<812,house.repairs?.[1]?.url);
 foreground('greenhouse-rail',2,['955,495 1318,456 1324,503 958,549','1066,485 1080,477 1092,486 1092,537 1077,542 1067,532','1175,472 1188,464 1202,471 1202,521 1187,526 1176,518'],p=>p.x>953&&p.x<1310&&p.y<543,house.repairs?.[2]?.url);
 foreground('upper-gate-post',2,['772,477 787,467 803,474 805,515 792,523 776,512'],p=>p.x>765&&p.x<910&&p.y<558,house.repairs?.[2]?.url);
 foreground('life-garden',2,['939,504 1085,484 1086,518 945,551','1168,471 1321,452 1322,499 1168,520'],p=>p.y<535);
 foreground('wardrobe-quilt',2,['331,653 370,636 416,623 463,618 504,628 534,664 548,705 545,731 535,728 527,714 358,741 350,724'],()=>false,house.repairs?.[2]?.url);
 const quiltPull=el('clipPath',{id:'quilt-pull-v16',clipPathUnits:'userSpaceOnUse'}),quiltRect=el('rect',{x:330,y:550,width:250,height:220});quiltPull.append(quiltRect);defs.append(quiltPull);
 const quiltLayer=occluders.find(o=>o.name==='wardrobe-quilt');quiltLayer.picture.setAttribute('clip-path','url(#'+instance+'room-front-wardrobe-quilt)');const paintQuilt=createRoomQuilt({document:doc,root:quiltLayer.g,picture:quiltLayer.picture,id:instance+'quilt-mesh'});
 const foldedQuilt=el('g',{display:'none','data-folded-quilt':true,'pointer-events':'none'}),foldedQuiltViewport=el('svg',{x:400,y:620,width:120,height:78,viewBox:'365 260 830 580'}),foldedQuiltImage=el('image',{width:1536,height:1024});foldedQuiltImage.setAttribute('clip-path',clip('folded-quilt-body','369,469 394,439 815,269 868,276 1155,545 1181,585 1180,680 1149,713 685,830 649,829 423,620 406,551 377,514'));foldedQuiltViewport.append(foldedQuiltImage);foldedQuilt.append(foldedQuiltViewport);floors[2].append(foldedQuilt);
 const upstairsControls=el('g',{'data-upstairs-controls':true});svg.append(upstairsControls);
 const hotspotDefs={
  read:{label:'书架：翻书',rect:[575,283,108,190],mark:[641,289]},
  enchant:{label:'附魔台：附魔练习',rect:[359,350,186,153],mark:[391,432]},
  garden:{label:'小麦温室：照料小麦',rect:[894,311,415,215],mark:[1253,363]},
  rest:{label:'露台：坐下歇脚',rect:[967,650,305,105],mark:[1211,714]}
 };
 if(upstairs)for(const [i,[mode,label]]of extraActions.entries()){
  const def=mode==='enchant'&&onFurniture?{...hotspotDefs[mode],label:'附魔台：日记'}:hotspotDefs[mode],g=el('g',{'data-room-hotspot':mode,role:'button',tabindex:0,'aria-label':def.label,class:'room-upstairs-hotspot'});
  g.append(el('title',{},def.label),el('rect',{x:def.rect[0],y:def.rect[1],width:def.rect[2],height:def.rect[3],rx:12,class:'room-hotspot-zone',fill:'transparent'}),el('circle',{cx:def.mark[0],cy:def.mark[1],r:17,class:'room-hotspot-dot'}),el('text',{x:def.mark[0],y:def.mark[1]+6,'text-anchor':'middle','font-size':17,'font-weight':700,'pointer-events':'none'},String(i+1)));
  const caption=el('g',{class:'room-hotspot-caption','pointer-events':'none'});caption.append(el('rect',{x:def.mark[0]-61,y:def.mark[1]-59,width:122,height:31,rx:9}),el('text',{x:def.mark[0],y:def.mark[1]-37,'text-anchor':'middle','font-size':16},mode==='enchant'&&onFurniture?'附魔台 · 日记':label));g.append(caption);
  if(mode==='enchant'&&onFurniture)g.setAttribute('data-room-furniture','enchant');hotspots[mode]=g;const select=()=>{if(mode==='read'&&onFurniture){onFurniture('bookshelf');return;}if(mode==='enchant'&&onFurniture){onFurniture('enchant');return;}if(!failedActions.has(mode))svg.setRoomActivity({preview:mode});};g.addEventListener('click',select);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});upstairsControls.append(g);
 }
 const effects=el('g',{'data-upstairs-effects':true,'pointer-events':'none'});resident.append(effects);
 const sparkles=[];for(let i=0;i<6;i++){const star=el('path',{d:'M-4,0 H4 M0,-4 V4',stroke:'#dcacff','stroke-width':2,fill:'none'});effects.append(star);sparkles.push(star);}
 const page=el('path',{fill:'#fff9da',stroke:'#c6a879','stroke-width':.7}),droplets=[];effects.append(page);
 for(let i=0;i<4;i++){const drop=el('ellipse',{rx:1.9,ry:3.2,fill:'#b5f0ff'});effects.append(drop);droplets.push(drop);}
 const leaf=el('path',{d:'M-7,0 Q0,-8 8,0 Q0,7 -7,0',fill:'#abd08b',opacity:.7});effects.append(leaf);
 const controls=el('g',{'data-house-controls':true,transform:'translate(0,1080)'});svg.append(controls);
 const curtain=el('g',{'data-curtain-overlay':true,display:room.curtain?'none':'inline'});controls.append(curtain);
 curtain.append(el('polygon',{points:'723,206 997,167 997,259 723,310',fill:'#778eae',stroke:'#57728f','stroke-width':2}));
 for(let x=730;x<1000;x+=15)curtain.append(el('path',{d:`M${x},${206-(x-723)*.142} v95`,fill:'none',stroke:x%2?'#9aafc8':'#617d9d','stroke-width':4,opacity:'.65'}));
 const lampState=el('g',{'data-lamp-overlay':true,display:room.lamp?'none':'inline'});lampState.append(el('polygon',{points:'737,335 757,331 764,362 740,371',fill:'#b89458',opacity:'.85'}));controls.append(lampState);
 const control=(kind,label,rect,fn)=>{const g=el('g',{'data-room-control':kind,role:'button',tabindex:0,'aria-label':label,class:'room-art-control'}),t=el('title',{},label);g.append(t,el('rect',{x:rect[0],y:rect[1],width:rect[2],height:rect[3],fill:'transparent',rx:5}));g.addEventListener('click',()=>fn?.());g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn?.();}});controls.append(g);return {g,t};};
 const curtainControl=control('curtain',room.curtain?'合上窗帘':'拉开窗帘',[692,164,344,150],onCurtain);
 const lampControl=control('lamp',room.lamp?'关闭台灯':'打开台灯',[730,320,42,57],onLamp);
 svg.setRoomEnvironment=({lamp,curtain:open}={})=>{
  if(open!==undefined){const v=Boolean(open),l=v?'合上窗帘':'拉开窗帘';curtain.setAttribute('display',v?'none':'inline');curtainControl.g.setAttribute('aria-label',l);curtainControl.t.textContent=l;}
  if(lamp!==undefined){const v=Boolean(lamp),l=v?'关闭台灯':'打开台灯';lampState.setAttribute('display',v?'none':'inline');lampControl.g.setAttribute('aria-label',l);lampControl.t.textContent=l;}
 };
 const featureLayers={};
 if(onFurniture){
  for(const level of [1,2]){const g=el('g',{'data-furniture-floor':level,transform:'translate(0,'+offsets[level]+')'});svg.append(g);featureLayers[level]=g;}
  const targets=[
   {id:'comms',level:1,label:'通讯屏：近况 · QQ · 表达',short:'通讯屏 · 近况与QQ',rect:[135,418,108,226],mark:[185,516],symbol:'讯'},
   {id:'workbench',level:1,label:'工坊台：工具 · 舱室 · 系统',short:'工坊台 · 工具与系统',rect:[250,235,335,335],mark:[542,435],symbol:'工'},
   {id:'computer',level:1,label:'电脑：记忆 · 人格 · 关系',short:'电脑 · 记忆与关系',rect:[784,268,268,142],mark:[1020,314],symbol:'忆'},
   {id:'bed',level:2,label:'床：长夜与梦境',short:'床铺 · 长夜与梦境',rect:[282,554,266,195],mark:[521,736],symbol:'梦'},
   {id:'mirror',level:2,label:'全息镜：换装',short:'全息镜 · 换装',rect:[685,171,121,169],mark:[797,196],symbol:'衣'}
  ];
  if(!upstairs)targets.push({id:'enchant',level:2,label:'附魔台：日记',short:'附魔台 · 日记',...hotspotDefs.enchant,symbol:'记'});
  for(const t of targets){
   const g=el('g',{'data-room-furniture':t.id,role:'button',tabindex:0,'aria-label':t.label,class:'room-upstairs-hotspot'});
   g.append(el('title',{},t.label),el('rect',{x:t.rect[0],y:t.rect[1],width:t.rect[2],height:t.rect[3],rx:12,class:'room-hotspot-zone',fill:'transparent'}),el('circle',{cx:t.mark[0],cy:t.mark[1],r:17,class:'room-hotspot-dot'}),el('text',{x:t.mark[0],y:t.mark[1]+6,'text-anchor':'middle','font-size':16,fill:'#aef6ff','pointer-events':'none'},t.symbol));
   const caption=el('g',{class:'room-hotspot-caption','pointer-events':'none'});caption.append(el('rect',{x:t.mark[0]-74,y:t.mark[1]-55,width:148,height:30,rx:8}),el('text',{x:t.mark[0],y:t.mark[1]-35,'text-anchor':'middle','font-size':14},t.short||t.label));g.append(caption);
   const select=()=>onFurniture(t.id);g.addEventListener('click',select);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});featureLayers[t.level].append(g);
  }
 }
 let suspended=false,disposed=false;
 svg.disposeRoomAmbient=()=>{disposed=true;guard.dispose();ambientWindows.forEach(w=>w.destroy());doc.removeEventListener?.('visibilitychange',resetFrameClock);};
 svg.setRoomPaused=value=>{const was=suspended;suspended=Boolean(value);frameAt=null;ambientWindows.forEach(w=>suspended?w.pause?.():w.resume?.());if(was&&!suspended&&!disposed&&resident.isConnected&&requestFrame&&!reduced){doc.removeEventListener?.('visibilitychange',resetFrameClock);doc.addEventListener?.('visibilitychange',resetFrameClock);requestFrame(tick);}};
 svg.setRoomArtAssets=a=>{for(const[picture,key]of artPictures)if(a[key]){picture.setAttribute('href',a[key]);if(picture.getAttribute?.('display')==='none')picture.setAttribute('display','inline');}if(a.mirror){mirrorPicture.setAttribute('href',a.mirror);mirrorPatch.setAttribute('display','inline');}};
 const interaction=el('g',{role:'button',tabindex:0,'aria-label':'摸摸小鲸鱼',class:'room-resident room-art-pat'}),hit=el('ellipse',{rx:62,ry:54,fill:'transparent'}),heart=el('text',{'font-size':27,fill:'#ffa8be','text-anchor':'middle',opacity:0,'pointer-events':'none'},'♥'),sparkle=el('text',{'font-size':19,fill:'#ffd1dc','text-anchor':'middle',opacity:0,'pointer-events':'none'},'✧'),blushLeft=el('ellipse',{rx:7,ry:4.5,fill:'#ff8fa3',opacity:0,'pointer-events':'none'}),blushRight=el('ellipse',{rx:7,ry:4.5,fill:'#ff8fa3',opacity:0,'pointer-events':'none'});interaction.append(hit,blushLeft,blushRight,heart,sparkle);svg.append(interaction);

 const setAttr=(n,k,v)=>{const val=String(v);const cur=typeof n.getAttribute==='function'?n.getAttribute(k):n.attributes?.[k];if(cur!==val)n.setAttribute(k,val);};
 const syncVisibility=()=>{
  const crossing=Boolean(detail&&route?.transition&&follow);
  const panning=camera&&Math.abs(camera[1]-offsets[floor])>1;
  for(const[level,g]of Object.entries(floors)){const visible=!crossing&&(floor==='all'||floor===level||panning);setAttr(g,'display',visible?'inline':'none');setAttr(g,'aria-hidden',String(!visible));}
  if(lifeAssets?.mattress)setAttr(quiltLayer.g,'display',!crossing&&!lifeSample?.frame?.compositeQuilt&&!(lifeAssets.foldedQuilt&&quiltCover===0)&&(floor==='all'||floor==='2'||panning)?'inline':'none');
  setAttr(foldedQuilt,'display',lifeAssets?.foldedQuilt&&quiltCover<.25&&!lifeSample?.frame?.compositeQuilt&&!crossing&&(floor==='all'||floor==='2'||panning)?'inline':'none');
  const visible=crossing||floor==='all'||floor===residentLevel||panning;
  setAttr(resident,'display',visible?'inline':'none');setAttr(interaction,'display',visible?'inline':'none');
  for(const[level,g]of Object.entries(featureLayers)){const visible=!crossing&&(floor==='all'||floor===level||panning);setAttr(g,'display',visible?'inline':'none');setAttr(g,'aria-hidden',String(!visible));}
  setAttr(controls,'display',crossing||floor==='2'?'none':'inline');setAttr(upstairsControls,'display',crossing||floor==='1'?'none':'inline');
 };
 const updateView=(dt=1000,force=false)=>{
  const centers={type:[900,390],write:[900,390],sleep:[420,640],lounge:[750,650],walk:[1020,610],read:[730,470],enchant:[495,420],garden:[1090,425],rest:[1090,670]};
  let target=floor==='all'?[0,0,1536,2104]:[0,offsets[floor],1536,1024];
  if(detail){
   const center=travelling?[route.x,route.y-80]:(centers[currentMode]||centers.walk);
   target=[center[0]-325,center[1]+offsets[residentLevel]-216.5,650,433];
  }
  const alpha=force||!camera||dt>1000?1:1-Math.exp(-Math.max(0,dt)/180);camera=camera?camera.map((v,i)=>{const next=v+(target[i]-v)*alpha;return Math.abs(target[i]-next)<.02?target[i]:next;}):target;
  setAttr(svg,'viewBox',camera.join(' '));setAttr(svg,'data-room-detail',String(detail));
 };
 const setFloor=(value,preserveDetail=false)=>{if(!['all','1','2'].includes(String(value)))return;floor=String(value);follow=false;if(!preserveDetail||floor==='all')detail=false;updateView(1000,true);setAttr(svg,'data-room-floor',floor);syncVisibility();onFloor?.(floor,{detail});};
 const paint=time=>{
  if(renderFailed)return false;
  const ok=guard.draw(()=>paintFrame(time));
  if(ok){
   drawFailures=0;
   const key=[currentMode,lifeSample?.pose,lifeSample?.phase].join('/');
   if(key!==lastPose){lastPose=key;snapshotDirty=true;diagnostics.record('pose',{mode:currentMode,pose:lifeSample?.pose,phase:lifeSample?.phase});}
   if(lifeAssets&&journey){
    if(snapshotDirty||!lastGoodRuntime){lastGoodRuntime=svg.getRoomRuntime();snapshotDirty=false;}
    else{
     lastGoodRuntime.savedAt=Date.now();lastGoodRuntime.preview=visual.preview;lastGoodRuntime.quiltCover=quiltCover;lastGoodRuntime.idle=idleEvents.snapshot();
     Object.assign(lastGoodRuntime.state,{elapsed,motionTime,floor,detail,currentMode,lastSource,travelling,residentLevel,follow,departure:departure?{...departure}:null,lifeClock,lastPaint,route:route?{...route,transition:route.transition?{...route.transition}:null}:null,camera:camera?[...camera]:null,previousPortal,wanderUntil,sleepStarted,sleepSeed,lifeMode,lifeExit,lifeNeedsEntry,lifeChairEntry});
    }
   }
  }
  return ok;
 };
 const recoverFrame=()=>{if(!renderFailed)return;renderFailed=false;svg.removeAttribute?.('data-room-render-error');if(lastGoodRuntime&&drawFailures<=2){svg.restoreRoomRuntime?.({...lastGoodRuntime,savedAt:Date.now()});diagnostics.record('draw-retry');}else{if(life){life.reset();lifeMode=null;}currentMode='walk';visual.preview='walk';departure=null;travelling=false;lifeNeedsEntry=false;lifeChairEntry=false;lifeExit=false;residentLevel='1';floor=residentLevel;journey=createRoomJourney(roomNavigation('walk'));journey.go('walk',motionTime);drawFailures=0;}};
 const paintFrame=time=>{
  const dt=Math.max(0,time-lastPaint),held=pausedWalk?Math.max(0,Math.min(time,patUntil)-lastPaint):0;
  motionTime+=idleSample?0:dt-held;lastPaint=time;const greeting=pausedWalk&&time<patUntil;
  // The leisure clock pauses during a trip, so a long climb gets to finish.
  // Base dwell times are scaled with a subtle natural variance per activity cycle.
  if(!travelling||currentMode==='walk'){
   const baseDwell=leisureDwell[currentMode]||60000;
   const variance=1+(((lifeClock/20000)|0)%4)*0.05;
   const dwell=Math.min(180000,Math.max(60000,Math.round(baseDwell*variance)));
   lifeClock+=(dt-held)*(20000/dwell);
  }
  const desired=activityAt(lifeClock);let mode=desired.mode,skipDeparture=false;
  idleSample=!reduced&&lifeAssets?.geometry.idleChair?idleEvents.sample({time,safe:mode==='walk'&&currentMode==='walk'&&route?.arrived&&route.kind==='idle'&&!route.transition&&!departure&&!greeting,point:[route?.x||0,route?.y||0],goal:mode}):null;
  if(idleSample&&desired.mode==='walk')mode=currentMode;
  const occupied=lifeMode?life?.sample(motionTime):null;
  if(!reduced&&visual.preview==='auto'&&currentMode==='sleep'&&mode!=='sleep'&&occupied?.phase==='perform'&&lifeAssets?.geometry.sleepMotion&&roomSleepVariation(motionTime-sleepStarted,sleepSeed))mode='sleep';
  const sameChair=!travelling&&['type','write'].includes(currentMode)&&['type','write'].includes(mode)&&(!occupied||occupied.support==='hips');
  if(life&&lifeMode&&!travelling&&!reduced&&(lifeExit||mode!==currentMode&&(!sameChair||occupied?.prop))){
   if(!lifeExit)lifeExit=sameChair?'seated':'standing';else if(!sameChair)lifeExit='standing';
   life.requestExit(motionTime,{seated:lifeExit==='seated'});snapshotDirty=true;
   if(life.sample(motionTime).ready){lifeChairEntry=life.sample(motionTime).support==='hips';lifeNeedsEntry=!lifeChairEntry;life.reset();lifeMode=null;lifeExit=false;skipDeparture=true;snapshotDirty=true;}
   else mode=currentMode;
  }
  const activity=mode===desired.mode?desired:{...desired,mode},isUpper=extraActions.some(([m])=>m===mode),changed=mode!==currentMode;
  setAttr(svg,'data-life-target',desired.mode);
  if(changed){
   snapshotDirty=true;
   if(life){life.reset();lifeMode=null;lifeNeedsEntry=currentMode!==null&&!sameChair;lifeChairEntry=sameChair;}
   if(!journey){journey=createRoomJourney(roomNavigation(mode));journey.go(mode,motionTime);}
   else if(!reduced){
    const wasContact=!travelling&&currentMode!=='walk'&&!sameChair&&!skipDeparture;departure=departure&&motionTime<departure.until?departure:wasContact?{mode:currentMode,at:motionTime,until:motionTime+240}:null;
    journey.go(mode,departure?.until||motionTime);
   }
   if(reduced){journey=createRoomJourney(roomNavigation(mode));journey.go(mode,motionTime);}
   currentMode=mode;wanderUntil=0;
  }
  lastSource=activity.source;route=journey.sample(motionTime);
  if(mode==='walk'&&!reduced&&route.arrived&&!idleSample){
   if(!wanderUntil)wanderUntil=motionTime+650+(animation.random||Math.random)()*2350;
   if(motionTime>=wanderUntil){journey.go(chooseRoomWander(route.target,animation.random||Math.random),motionTime);route=journey.sample(motionTime);wanderUntil=0;snapshotDirty=true;}
  }
  travelling=!reduced&&(!route.arrived||Boolean(departure&&motionTime<departure.until));
  lifeSample=null;
  if(idleSample){const g=lifeAssets.geometry.idleChair,pose=cell=>{const f=g.frames[cell];return {atlas:'idleChair',cell,at:idleSample.position,pivot:f.anchor,head:f.head,scale:188/g.referenceHeight,support:'feet',prop:null,articulated:true};};lifeSample={mode:'walk',pose:'idle-'+idleSample.cell,phase:'perform',support:'feet',prop:null,move:false,position:idleSample.position,frame:pose(idleSample.cell),nextFrame:pose(idleSample.nextCell),progress:idleSample.progress,duration:idleSample.duration,variation:idleSample.returning?'站稳，继续走向原来的目的地':'停一小会儿，看看周围'};}
  if(life&&!travelling&&mode!=='walk'&&life.has(mode)){
   if(lifeMode!==mode){sleepStarted=motionTime;life.start(mode,motionTime,{settled:!lifeNeedsEntry,seated:lifeChairEntry});lifeMode=mode;lifeNeedsEntry=false;lifeChairEntry=false;snapshotDirty=true;}
   lifeSample=reduced?life.still(mode):life.sample(motionTime);
  }
  if(!reduced&&lifeSample?.mode==='sleep'&&lifeSample.phase==='perform'&&lifeAssets?.geometry.transition&&!lifeAssets?.geometry.bedBody){
   const e=roomSleepVariation(motionTime-sleepStarted,sleepSeed);svg.setAttribute('data-sleep-event',e?.kind||'');
   if(e){const p=e.progress,wave=Math.sin(Math.PI*p),reference=Boolean(lifeAssets.geometry.sleepReference),g=lifeAssets.geometry.sleepReference||lifeAssets.geometry.sleepMotion;
    if(g){const restPosition=[...lifeSample.position],p0=lifeSample.frame,restHead=restPosition.map((v,i)=>v+(p0.head[i]-p0.pivot[i])*p0.scale);const cell=(e.kind==='kick'?8:0)+Math.min(7,Math.floor(p*8)),f=g.frames[cell];
    lifeSample={...lifeSample,pose:'sleep-'+e.kind,restPosition,position:restHead,frame:{...lifeSample.frame,atlas:reference?'sleepReference':'sleepMotion',cell,sleepCell:reference?undefined:cell,sleepReferenceCell:reference?cell:undefined,transitionCell:undefined,bedReferenceCell:undefined,compositeQuilt:reference,pivot:[...f.head],head:[...f.head],scale:188/g.referenceHeight,rotation:0},cover:reference?1:e.kind==='kick'?1-Math.sin(Math.PI*p)*.65:1,quiltLift:reference?0:e.kind==='kick'?Math.sin(Math.PI*p*2)**2*8:wave*3,variation:e.kind==='kick'?'蜷起腿，轻轻踢开被角，再拉回来':'轻轻侧过身，继续睡觉'};}
 
   }
  }else svg.setAttribute('data-sleep-event','');
  if(!reduced&&lifeSample?.mode==='sleep'&&lifeSample.phase==='perform'&&lifeAssets?.geometry.bedBody){const event=roomSleepVariation(motionTime-sleepStarted,sleepSeed);if(event){const stages=event.kind==='kick'?[8,10,10,8]:[8,9,9,8],at=Math.min(3,Math.floor(event.progress*4)),cell=stages[at],next=stages[Math.min(3,at+1)],g=lifeAssets.geometry.bedBody,pose=c=>({...lifeSample.frame,cell:c,bedBodyCell:c,pivot:g.frames[c].head,head:g.frames[c].head});lifeSample={...lifeSample,pose:'sleep-'+event.kind,frame:pose(cell),nextFrame:pose(next),duration:1625,progress:event.progress*4-at,cover:event.kind==='kick'?1-Math.sin(Math.PI*event.progress)*.35:1,variation:event.kind==='kick'?'轻轻踢开被角，再拉回来':'翻个身，继续睡觉'};}}
  svg.setAttribute('data-life-mode',lifeSample?.mode||'');svg.setAttribute('data-life-phase',lifeSample?.phase||'');svg.setAttribute('data-life-pose',lifeSample?.pose||'');svg.setAttribute('data-life-support',lifeSample?.support||'');
  writingPaper.setAttribute('display',lifeSample?.mode==='write'?'inline':'none');cupRest.setAttribute('display',lifeSample?.mode==='rest'&&lifeSample.prop==='cup'?'none':'inline');
  const visibleFrame=lifeSample&&transitionWindow(lifeSample)>=.5?lifeSample.nextFrame:lifeSample?.frame;
  const wholeChair=Boolean(visibleFrame?.chair&&lifeAssets?.chairCleanplate);chairErase.setAttribute('display',wholeChair?'inline':'none');
  if(detail&&previousPortal&&!route.transition&&camera){const p=previousPortal;camera[0]+=p.to.x-p.from.x;camera[1]+=p.to.y+offsets[p.to.floor]-p.from.y-offsets[p.from.floor];}
  previousPortal=detail&&follow?route.transition:null;
  residentLevel=String(route.transition?.from.floor||route.floor);
  if((follow||changed&&reduced)&&floor!=='all'&&floor!==residentLevel){floor=residentLevel;onFloor?.(floor,{detail});}
  setAttr(svg,'data-room-floor',floor);setAttr(svg,'data-room-activity',mode);setAttr(svg,'data-room-source',activity.source);setAttr(svg,'data-resident-travel',String(travelling));setAttr(svg,'data-resident-level',residentLevel);setAttr(svg,'data-travel-kind',route.kind);setAttr(svg,'data-travel-arrives',route.arrivesAt);
  const transition=route.transition;setAttr(portal,'display',detail&&transition&&follow?'inline':'none');
  if(transition&&detail&&follow){const {from,to,progress}=transition;for(const[level,g]of Object.entries(portalFloors)){const old=Number(level)===from.floor;g.setAttribute('opacity',old?1-progress:progress);g.setAttribute('transform',old?'translate(0,'+offsets[from.floor]+')':'translate('+(from.x-to.x)+','+(from.y+offsets[from.floor]-to.y)+')');}setAttr(svg,'data-stair-progress',transition.progress);}
  else setAttr(svg,'data-stair-progress','');
  const departing=departure&&motionTime<departure.until;
  const displayed=departing&&motionTime<departure.at+120?departure.mode:travelling?'walk':mode;
  for(const[k,g]of Object.entries(poses))g.setAttribute('display',k===displayed&&!lifeSample?'inline':'none');
  if(!lifeSample)lifeArt?.hide();
  let opacity=1;
  if(departing)opacity=motionTime<departure.at+120?1-(motionTime-departure.at)/120:(motionTime-departure.at-120)/120;
  else if(!lifeSample&&!travelling&&mode!=='walk'&&motionTime-route.arrivesAt<220&&route.arrivesAt>0)opacity=Math.max(0,(motionTime-route.arrivesAt)/220);
  resident.setAttribute('opacity',opacity);setAttr(svg,'data-resident-phase',greeting?'greeting':departing?'departing':travelling?'travelling':'contact');
  const movementLabel=transition?(transition.to.floor>transition.from.floor?'沿楼梯上到二楼…':'沿楼梯回到一楼…'):route.kind==='stairs'?(route.ascending?'一步一步上台阶…':'一步一步下台阶…'):'正在走向'+({sleep:'床边',type:'电竞椅',write:'书桌',lounge:'沙发',read:'书架',enchant:'附魔台',garden:'温室',rest:'露台',walk:'过道'}[mode])+'…';
  const notice=[mode,activity.source,visual.preview,travelling,greeting,route.kind,residentLevel,lifeSample?.phase,lifeSample?.variation].join(':');
  if(notice!==lastNotice){lastNotice=notice;onActivity?.({...activity,preview:visual.preview,availableActions:svg.roomActions.map(([m])=>m),moving:travelling&&!greeting,target:desired.mode,label:greeting?'停下来，蹭蹭你的手…':lifeExit?'收好东西，准备起身…':travelling?movementLabel:lifeSample?.variation||activity.label});}
  syncVisibility();updateView(dt,reduced);
  const visible=Boolean(transition&&follow)||floor==='all'||floor===residentLevel;if(!visible)return;
  const position=transition?{...transition.from,moving:false,frame:null,facing:1}:route;
  let head=hitPoints[mode]||[position.x,position.y-150],offset=offsets[residentLevel],propPoint=null;
  const depthPoint=lifeSample?{x:lifeSample.position[0],y:lifeSample.position[1]}:position;
  if(lifeSample?.mode==='sleep')quiltCover=lifeSample.cover??quiltCover;
  paintQuilt(quiltCover,lifeSample?.quiltLift||0);bedSheet.setAttribute('opacity',Math.max(0,(quiltCover-.6)/.4));foldedQuilt.setAttribute('opacity',Math.max(0,1-quiltCover/.25));quiltLayer.g.setAttribute('opacity',lifeAssets?.foldedQuilt?Math.min(1,quiltCover/.25):1);
  for(const mask of occluders){
   if(mask.name==='chair'&&wholeChair){mask.g.setAttribute('display','none');continue;}
   const name=mask.name;if(name==='wardrobe-quilt'&&lifeAssets?.mattress){mask.g.setAttribute('display',!transition&&!lifeSample?.frame?.compositeQuilt&&!(lifeAssets.foldedQuilt&&quiltCover===0)&&(floor==='all'||floor==='2')?'inline':'none');continue;}
   const contactMask=name==='wardrobe-quilt'&&Boolean(lifeAssets?.mattress)||name==='wardrobe-quilt'&&displayed==='sleep'&&!travelling&&(lifeSample?lifeSample.support==='bed'||lifeSample.cover>0:wardrobe.active)||lifeSample&&((name==='chair'&&['type','write'].includes(mode)&&depthPoint.x<995&&depthPoint.y<521)||(name==='life-garden'&&mode==='garden'&&depthPoint.y<535)||(name==='sofa'&&mode==='lounge'&&depthPoint.x>620&&depthPoint.x<965&&depthPoint.y<750));
   const walking=displayed==='walk'||lifeSample?.move;
   mask.g.setAttribute('display',mask.level===Number(residentLevel)&&(contactMask||walking&&!transition&&name!=='life-garden'&&!(name==='greenhouse-rail'&&lifeSample?.mode==='garden')&&mask.when(depthPoint))?'inline':'none');
  }
  foldedQuilt.setAttribute('display',lifeAssets?.foldedQuilt&&quiltCover<.25&&!lifeSample?.frame?.compositeQuilt&&!transition&&(floor==='all'||floor==='2')?'inline':'none');
  if(lifeSample){const result=lifeArt.render(lifeSample,offset);head=result.head;propPoint=result.prop;svg.setAttribute('data-resident-feet',lifeSample.position.join(','));}
  if(displayed==='walk'&&!lifeSample){
   const stepping=position.kind==='stairs',moving=position.moving&&!departing&&!greeting;
   walkPose.setAttribute('data-resident-floor',residentLevel);
   // Use the same complete walking cycle on the stairs: four phases per
   // tread, then the opposite leg. Keep facing stable through the curve.
   const facing=stepping?(position.ascending?-1:1):position.facing;
   walkPose.setAttribute('transform','translate('+position.x+','+(position.y+offset)+') scale('+(moving?facing:1)+',1)');
   walkSheet.setAttribute('display',moving?'inline':'none');standing.setAttribute('display',!moving?'inline':'none');
   if(moving)walkSheet.setAttribute('viewBox',walkAsset.frames[position.frame].join(' '));
   else{const isPat=time<patUntil,idle=isPat?(petAssets.head_pat||petAssets.idle):petAssets.idle,clipTime=isPat?time-patStarted:time;if(idle?.frames?.length)standing.setAttribute('href',idle.frames[reduced?0:Math.floor(clipTime/idle.frameMs)%idle.frames.length]);else{walkSheet.setAttribute('display','inline');walkSheet.setAttribute('viewBox',walkAsset.frames[1].join(' '));}}
   svg.setAttribute('data-walk-moving',String(moving));svg.setAttribute('data-walk-frame',moving?position.frame:'standing');svg.setAttribute('data-resident-feet',position.x+','+position.y);head=[position.x,position.y-153];
  }
  const loop=frames[displayed];if(loop){const phase=reduced?0:Math.floor(time/loop.asset.frameMs)%2;loop.alternate.setAttribute('href',loop.asset.frames[1]);loop.hand.setAttribute('opacity',phase);loop.hand.setAttribute('data-animation-phase',phase);}
  if(wardrobe.active){
   for(const g of Object.values(poses))g.setAttribute('display','none');lifeArt?.hide();
   const moving=displayed==='walk'&&position.moving&&!departing&&!greeting;
   const point=lifeSample?.position||(displayed==='walk'?[position.x,position.y]:house.actions[displayed]?.feet||[position.x,position.y]);
   const flip=displayed==='walk'?(position.kind==='stairs'?(position.ascending?1:-1):-(position.facing||1)):(lifeSample?.frame?.flip||1)*(lifeSample?.move&&lifeSample.frame.atlas==='walk'?-1:1);
   const result=wardrobe.render({mode:displayed,moving,frame:lifeSample?.move?lifeSample.frame.cell:position.frame,gait:lifeSample?.move?lifeSample.frame.cell:position.gaitPhase,time:motionTime,reduced,life:lifeSample,position:[point[0],point[1]+offset],flip});
   if(result){head=[result.head[0],result.head[1]-offset];propPoint=[result.prop[0],result.prop[1]-offset];}
  }
  const showEffects=isUpper&&!travelling;setAttr(effects,'display',showEffects?'inline':'none');
  if(showEffects){
   const phase=reduced?0:time/1000;
   sparkles.forEach((star,i)=>{const show=mode==='enchant'&&(!lifeSample||lifeSample.prop==='crystal');setAttr(star,'display',show?'inline':'none');if(show){star.setAttribute('transform','translate('+((propPoint?.[0]??450)-28+i*10)+','+((propPoint?.[1]??345)+(i%3)*7-Math.sin(phase*2+i)*8)+')');star.setAttribute('opacity',.4+.5*Math.abs(Math.sin(phase+i)));}});
   const showPage=mode==='read'&&!lifeSample;setAttr(page,'display',showPage?'inline':'none');if(showPage){page.setAttribute('transform','translate('+(house.actions.read?.offset||[0,0]).join(',')+')');page.setAttribute('d','M701,455 Q'+(710+Math.sin(phase)*8)+',442 727,465 L726,471 Q711,453 701,455');page.setAttribute('opacity',reduced?0:.2+.45*Math.max(0,Math.sin(phase*.7)));}
   const pouring=mode==='garden'&&(!lifeSample||lifeSample.frame.atlas==='garden'&&[8,9].includes(lifeSample.frame.cell));
   droplets.forEach((drop,i)=>{setAttr(drop,'display',pouring?'inline':'none');if(pouring){const d=(phase*1.2+i*.25)%1;drop.setAttribute('cx',(propPoint?.[0]??1036)-d*18*(lifeSample?.frame.flip||1));drop.setAttribute('cy',(propPoint?.[1]??389)+d*24);drop.setAttribute('opacity',reduced?.5:1-d);}});
   setAttr(leaf,'display',mode==='rest'?'inline':'none');if(mode==='rest')leaf.setAttribute('transform','translate('+(1200+Math.sin(phase*.6)*25)+','+(645+Math.sin(phase)*12)+') rotate('+phase*9+')');
  }
  const isPatting=time<patUntil;
  setAttr(hit,'cx',head[0]);setAttr(hit,'cy',head[1]+offset);
  if(isPatting){
   const patProgress=patUntil>patStarted?Math.max(0,Math.min(1,(time-patStarted)/(patUntil-patStarted))):1;
   const patAlpha=Math.sin(patProgress*Math.PI);
   heart.setAttribute('x',head[0]);heart.setAttribute('y',head[1]+offset-64-patProgress*14);setAttr(heart,'opacity',Math.round(patAlpha*100)/100);
   sparkle.setAttribute('x',head[0]+26);sparkle.setAttribute('y',head[1]+offset-48-patProgress*8);setAttr(sparkle,'opacity',Math.round(patAlpha*.85*100)/100);
   blushLeft.setAttribute('cx',head[0]-15);blushLeft.setAttribute('cy',head[1]+offset-22);setAttr(blushLeft,'opacity',Math.round(patAlpha*.55*100)/100);
   blushRight.setAttribute('cx',head[0]+15);blushRight.setAttribute('cy',head[1]+offset-22);setAttr(blushRight,'opacity',Math.round(patAlpha*.55*100)/100);
  }else{
   setAttr(heart,'opacity',0);setAttr(sparkle,'opacity',0);setAttr(blushLeft,'opacity',0);setAttr(blushRight,'opacity',0);
  }
  setAttr(resident,'data-pet-state',isPatting?'head_pat':'idle');
 };
 svg.setRoomFloor=setFloor;svg.setRoomDetail=value=>{detail=Boolean(value);follow=true;floor=residentLevel;updateView(1000,true);svg.setAttribute('data-room-floor',floor);syncVisibility();onFloor?.(floor,{detail});return detail;};
 svg.setRoomActivity=patch=>{snapshotDirty=true;if(Object.hasOwn(patch,'preview')){if(patch.preview==='auto'&&visual.preview!=='auto'){const slice=Math.floor(Math.max(0,lifeClock)/20000);lifeClock=slice*20000;}if(renderFailed){renderFailed=false;svg.removeAttribute?.('data-room-render-error');drawFailures=0;if(life){life.reset();lifeMode=null;}currentMode=null;departure=null;travelling=false;lifeNeedsEntry=false;lifeChairEntry=false;lifeExit=false;}diagnostics.record('action',{mode:patch.preview});}visual={...visual,...patch};if(patch.teleport&&patch.preview){const nav=roomNavigation(patch.preview),targetNode=nav.targets[patch.preview]||'aisle',targetFloor=nav.nodes[targetNode]?.floor||1;journey=createRoomJourney(nav);journey.go(patch.preview,motionTime);departure=null;travelling=false;lifeNeedsEntry=false;lifeChairEntry=false;lifeExit=false;if(life){life.reset();lifeMode=null;}currentMode=null;residentLevel=String(targetFloor);floor=residentLevel;}if(Object.hasOwn(patch,'preview')){follow=true;if(floor!=='all'&&floor!==residentLevel){floor=residentLevel;onFloor?.(floor,{detail});}}paint(elapsed);};
 svg.setRoomOutfit=asset=>{if(!wardrobe.set(asset))return false;recoverFrame();svg.setAttribute('data-room-outfit',asset?.id||'original');paint(elapsed);return true;};
 const pat=()=>{patStarted=elapsed;patUntil=elapsed+900;pausedWalk=Boolean(lifeSample?.move)||(currentMode==='walk'&&route?.arrived)||(route?.kind==='walk'&&!(departure&&motionTime<departure.until));paint(elapsed);};interaction.addEventListener('click',pat);interaction.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pat();}});
 // Only foreground time advances the local scene; hidden tabs must not turn
 // one resumed frame into several seconds of walking or a new activity.
 const resetFrameClock=()=>{frameAt=null;if(!doc.hidden&&!suspended&&!disposed&&resident.isConnected&&requestFrame&&!reduced){requestFrame(tick);}if(!resident.isConnected)doc.removeEventListener?.('visibilitychange',resetFrameClock);};
 const tick=time=>{if(disposed||!resident.isConnected){doc.removeEventListener?.('visibilitychange',resetFrameClock);return;}const dt=frameAt===null?0:Math.max(0,time-frameAt);frameAt=time;if(!doc.hidden&&!suspended&&!renderFailed){elapsed+=dt;paint(elapsed);}if(!disposed&&resident.isConnected&&!suspended)requestFrame(tick);};
 svg.setRoomLifeAssets=assets=>{
  // postMessage clones objects. Each artwork revision is immutable; repeat
  // deliveries must never reset a reclining pose or an in-progress safe exit.
  if(lifeAssets&&lifeAssets.version===assets?.version&&lifeAssets.revision===assets?.revision||lifeLoading)return svg.roomLifeReady;
  if(!validateRoomLifeAssets(assets)){diagnostics.record('asset-error',{stage:'validate',revision:assets?.revision});return Promise.resolve(false);}
  lifeLoading=true;
  const token=++lifeLoad,load=animation.loadRoomImage||(url=>decodeRoomLifeUrl(url,doc.defaultView?.Image||globalThis.Image));
  diagnostics.record('load-start',{revision:assets.revision});
  const sources={...assets.atlases,greenhouse:assets.greenhouse,...Object.fromEntries(['bedding','mattress','foldedQuilt','chairCleanplate'].filter(k=>assets[k]).map(k=>[k,assets[k]])),...(assets.quilt?{quilt:assets.quilt.url}:{})};
  svg.roomLifeReady=Promise.all(Object.entries(sources).map(async([asset,url])=>{const started=Date.now();try{await roomResourceDeadline(load(url),animation.decodeTimeoutMs??15000);diagnostics.record('decoded',{asset,duration:Date.now()-started});}catch(error){diagnostics.record('asset-error',{asset,stage:'decode',error:error?.message||'Image load failed'});throw error;}})).then(()=>{
   if(token!==lifeLoad)return false;
   const next=createRoomChoreography(createRoomLifeDefinitions(assets.geometry));
   if(assets.chairCleanplate)chairEraseImage.setAttribute('href',assets.chairCleanplate);const walkAtlas=assets.geometry.walk;if(assets.atlases.walk&&!walkPic.getAttribute?.('href')&&walkAtlas?.width===walkAsset.width&&walkAtlas?.height===walkAsset.height)walkPic.setAttribute('href',assets.atlases.walk);// Browser builds defer '/plugins/' sheets; the life bundle carries the same walk-v3 atlas inline.
   if(assets.bedding){bedSheetImage.setAttribute('href',assets.bedding);bedSheet.setAttribute('display','inline');}
   lifeArt?.hide();lifeArt=createRoomLifeArt({document:doc,root:lifeRoot,assets});life=next;lifeAssets=assets;lifeMode=null;lifeExit=false;snapshotDirty=true;if(assets.foldedQuilt)foldedQuiltImage.setAttribute('href',assets.foldedQuilt);
   if(assets.bedding){bedSurfaceImage.setAttribute('href',assets.mattress||assets.bedding);bedSurface.setAttribute('display','inline');quiltLayer.picture.setAttribute('href',assets.bedding);
    const p=quiltLayer.picture;for(const[k,v]of Object.entries({x:0,y:0,width:house.width,height:house.height,transform:'', 'clip-path':'url(#'+instance+'room-front-wardrobe-quilt)'}))p.setAttribute(k,v);
    if(assets.quilt&&!assets.geometry.bedBody){const q=assets.quilt,[x,y,w,h]=q.crop;p.setAttribute('href',q.url);p.setAttribute('x',330-x*218/w);p.setAttribute('y',618-y*136/h);p.setAttribute('width',q.width*218/w);p.setAttribute('height',q.height*136/h);p.setAttribute('clip-path','none');p.setAttribute('transform','translate(878,0) scale(-1,1)');}}
   gardenPicture.setAttribute('href',assets.greenhouse);occluders.find(x=>x.name==='life-garden').picture.setAttribute('href',assets.greenhouse);lifeScenery.setAttribute('display','inline');svg.setAttribute('data-life-version',String(assets.version));paint(elapsed);diagnostics.record('load-ready',{revision:assets.revision});return true;
  }).catch(error=>{diagnostics.record('asset-error',{stage:'activate',error:error?.message||String(error)});return false;}).finally(()=>{if(token===lifeLoad)lifeLoading=false;});return svg.roomLifeReady;
 };
 const roomIdentity=JSON.stringify(room.items.map(({id,name})=>[id,name]));
 svg.getRoomRuntime=()=>renderFailed?(lastGoodRuntime?structuredClone({...lastGoodRuntime,savedAt:Date.now()}):null):lifeAssets&&journey?{version:1,revision:lifeAssets.revision,identity:roomIdentity,savedAt:Date.now(),preview:visual.preview,quiltCover,state:{elapsed,motionTime,floor,detail,currentMode,lastSource,travelling,residentLevel,follow,departure,lifeClock,lastPaint,route,camera,previousPortal,wanderUntil,sleepStarted,sleepSeed,lifeMode,lifeExit,lifeNeedsEntry,lifeChairEntry},idle:idleEvents.snapshot(),journey:journey.snapshot(),life:life?.snapshot()}:null;
 svg.restoreRoomRuntime=value=>{
  try{
   const migrating=[17,19].includes(value?.revision)&&lifeAssets?.revision===20;
   const compatibleRevision=value?.revision===lifeAssets?.revision||value?.revision===17&&lifeAssets?.revision===19||migrating;
   if(value?.version!==1||value.identity!==roomIdentity||!compatibleRevision||!Number.isFinite(value.savedAt))return false;
   const s=value.state;if(!s||![s.elapsed,s.motionTime,s.lifeClock,s.lastPaint,s.sleepStarted,s.sleepSeed,s.wanderUntil].every(Number.isFinite)||!['all','1','2'].includes(s.floor)||!['1','2'].includes(s.residentLevel)||!['auto','walk','sleep','type','write','lounge','read','enchant','garden','rest'].includes(value.preview))return false;
   const nextJourney=createRoomJourney(roomNavigation(s.currentMode));nextJourney.restore(value.journey);
   const nextLife=createRoomChoreography(createRoomLifeDefinitions(lifeAssets.geometry));
   if(migrating&&value.life?.mode==='sleep')nextLife.start('sleep',s.motionTime,{settled:true});else nextLife.restore(value.life);
   ({elapsed,motionTime,floor,detail,currentMode,lastSource,travelling,residentLevel,follow,departure,lifeClock,lastPaint,route,camera,previousPortal,wanderUntil,sleepStarted,sleepSeed,lifeMode,lifeExit,lifeNeedsEntry,lifeChairEntry}=s);
   quiltCover=Number.isFinite(value.quiltCover)?Math.max(0,Math.min(1,value.quiltCover)):0;journey=nextJourney;life=nextLife;idleEvents.restore(value.idle);idleSample=null;visual.preview=value.preview;frameAt=null;pausedWalk=false;patUntil=0;
   if(migrating&&value.life?.mode==='sleep'){lifeExit=false;lifeNeedsEntry=false;quiltCover=1;}
   // Advance clocks without running hidden animation frames or replaying steps.
   lastNotice='';snapshotDirty=true;
   elapsed+=Math.min(86400000,Math.max(0,Date.now()-value.savedAt));paint(elapsed);updateView(1000,true);onFloor?.(floor,{detail});return true;
  }catch{return false;}
 };
 paint(0);updateView(1000,true);if(requestFrame&&!reduced){doc.addEventListener?.('visibilitychange',resetFrameClock);requestFrame(tick);}if(actionAssets.lifeV10)svg.setRoomLifeAssets(actionAssets.lifeV10);return svg;
}

