import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { CompanionService } from './src/service.mjs';
import { Script } from 'node:vm';
const read = file => readFile(new URL(file, import.meta.url), 'utf8');
const css = await read('./panel.css')+'\n'+await read('./room-workspace.css');
const petManifest = JSON.parse(await read('./assets/room-pet/manifest.json'));
const actionAssets = JSON.parse(await read('./assets/room-actions/manifest.json'));
const wardrobeCatalog=JSON.parse(await read('./assets/wardrobe-v1/catalog.json'));
// A native, revisioned client chunk keeps the entry small and can update
// artwork without restarting the host while an unrelated session is running.
const inlineRoomAsset=async file=>'data:image/png;base64,'+(await readFile(new URL('./assets/room-house/'+file,import.meta.url))).toString('base64');
const roomImages={};for(const [name,file] of Object.entries({'floor-one':'floor-one-v6.png','floor-two':'floor-two-v7.png',garden:'upstairs-garden-v7.png'}))roomImages[name]=await inlineRoomAsset(file);
const petClips = {};
for (const [name,clip] of Object.entries(petManifest.clips)) {
  petClips[name] = { frameMs:clip.frameMs, frames:clip.frames.map(file => '/plugins/dsh-dafeiyu/frame?frame='+encodeURIComponent(file)) };
}
// Verifiable, safe module syntax transformer for project internal ES modules.
function stripModuleSyntax(source, filename) {
  const code = source
    .replace(/^\s*import\s+(?:['"][^'"]+['"]|[\s\S]*?from\s+['"][^'"]+['"]);?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+async\s+function\b/gm, 'async function')
    .replace(/^\s*export\s+default\s+function\b/gm, 'function')
    .replace(/^\s*export\s+default\s+class\b/gm, 'class')
    .replace(/^\s*export\s+async\s+function\b/gm, 'async function')
    .replace(/^\s*export\s+function\b/gm, 'function')
    .replace(/^\s*export\s+class\b/gm, 'class')
    .replace(/^\s*export\s+(const|let|var)\b/gm, '$1')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
  try {
    new Script(code, { filename });
  } catch (err) {
    throw new Error(`[build.mjs] Module syntax validation failed for ${filename}: ${err.message}`);
  }
  return code;
}
const bundleModule = async relPath => stripModuleSyntax(await read(relPath), relPath);

const life = await bundleModule('./src/room-life.mjs');
const journey = await bundleModule('./src/room-journey.mjs');
const navigation = await bundleModule('./src/room-navigation.mjs');
const house = await bundleModule('./src/room-house.mjs');
const daylight = await bundleModule('./src/room-daylight.mjs');
const art = await bundleModule('./src/room-art.mjs');
const motion = (await Promise.all(['room-diagnostics','room-choreography','room-idle-events','room-contact-v20','room-life-sequences','room-pose-transition','room-pose-blend','room-hand-motion','room-life-art'].map(name=>bundleModule('./src/'+name+'.mjs')))).join('\n');
const wardrobe = await bundleModule('./src/room-wardrobe.mjs');
const scene = 'const WARDROBE_CATALOG='+JSON.stringify(wardrobeCatalog.map(({id,name})=>({id,name})))+';\n'+wardrobe+'\n'+life + '\n' + journey + '\n' + navigation + '\n' + house + '\n' + motion + '\n' + daylight + '\n' + art + '\n' + await bundleModule('./src/room-scene.mjs');
const workspace = await bundleModule('./src/room-workspace.mjs');
const books = (await Promise.all(['room-books','room-book-reader'].map(name=>bundleModule('./src/'+name+'.mjs')))).join('\n');
const js = ('const DAFEIYU_CLIPS='+JSON.stringify(petClips)+';\nconst ROOM_ACTIONS='+JSON.stringify(actionAssets)+';\n'+scene + '\n' + workspace + '\n' + books + '\n' + await read('./panel.js')).replace(/<\/script/gi, '<\\/script');
new Script(js, { filename: 'panel.js' });
const html = (await read('./panel.html')).replace('__PANEL_CSS__', () => css).replace('__PANEL_JS__', () => js);
const template = (await readFile(new URL('./client.template.js', import.meta.url), 'utf8')).replace('__WARDROBE_IDS__',()=>JSON.stringify(wardrobeCatalog.map(o=>o.id)));
await mkdir(new URL('./lib/', import.meta.url), { recursive: true });
const wardrobeGeometry=JSON.parse(await read('./assets/wardrobe-v1/geometry.json'));
const wardrobeDeskGeometry=JSON.parse(await read('./assets/wardrobe-v15/geometry.json'));
const supplementGeometry=JSON.parse(await read('./assets/room-transition-v17/supplement-geometry.json'));
const transitionGeometry=JSON.parse(await read('./assets/room-transition-v17/geometry.json'));
const bedReferenceGeometry=JSON.parse(await read('./assets/room-bed-reference-v19/geometry.json'));
const sleepReferenceGeometry=JSON.parse(await read('./assets/room-bed-reference-v19/sleep-geometry.json'));
const leisureGeometry=Object.fromEntries(await Promise.all(['sofaSocial','sofaBody','idleChair'].map(async key=>[key,JSON.parse(await read('./assets/room-motion-v20/'+key+'-geometry.json'))])));
const bedBodyGeometry=JSON.parse(await read('./assets/room-motion-v20/bed-geometry.json'));
const walkGeometry=JSON.parse(await read('./assets/wardrobe-v16/walk-geometry.json')),bedGeometry=JSON.parse(await read('./assets/wardrobe-v16/bed-geometry.json'));
for(const {id} of wardrobeCatalog){
 const payload={version:1,id,geometry:wardrobeGeometry[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/wardrobe-v1/'+id+'.png',import.meta.url))).toString('base64')};
 await writeFile(new URL('./lib/client.wardrobe-'+id+'-v1.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.wardrobe-'+id+'-v1.js",factory:()=>('+JSON.stringify(payload)+')});\n');
 payload.desk={geometry:wardrobeDeskGeometry[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/wardrobe-v15/'+id+'-desk.png',import.meta.url))).toString('base64')};
 if(!payload.desk.geometry)throw new Error('Missing desk geometry: '+id);
 await writeFile(new URL('./lib/client.wardrobe-'+id+'-v15.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.wardrobe-'+id+'-v15.js",factory:()=>('+JSON.stringify(payload)+')});\n');
 for(const kind of ['walk','bed'])payload[kind]={geometry:(kind==='walk'?walkGeometry:bedGeometry)[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/wardrobe-v16/'+id+'-'+kind+'.png',import.meta.url))).toString('base64')};
 await writeFile(new URL('./lib/client.wardrobe-'+id+'-v16.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.wardrobe-'+id+'-v16.js",factory:()=>('+JSON.stringify(payload)+')});\n');
 payload.transition={geometry:transitionGeometry[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-transition-v17/'+id+'.png',import.meta.url))).toString('base64')};
 for(const[kind,key]of [['sleep','sleepMotion'],['desk','deskTransition']])payload[key]={geometry:supplementGeometry[kind][id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-transition-v17/'+id+'-'+kind+'.png',import.meta.url))).toString('base64')};
 await writeFile(new URL('./lib/client.wardrobe-'+id+'-v17.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.wardrobe-'+id+'-v17.js",factory:()=>('+JSON.stringify(payload)+')});\n');
 payload.bedReference={geometry:bedReferenceGeometry[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-bed-reference-v19/'+id+'-fixed.png',import.meta.url))).toString('base64')};
 payload.sleepReference={geometry:sleepReferenceGeometry[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-bed-reference-v19/'+id+'-sleep.png',import.meta.url))).toString('base64')};
 await writeFile(new URL('./lib/client.wardrobe-'+id+'-v19.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.wardrobe-'+id+'-v19.js",factory:()=>('+JSON.stringify(payload)+')});\n');
 payload.bedBody={geometry:bedBodyGeometry[id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-motion-v20/'+id+'-bed.png',import.meta.url))).toString('base64')};
 if(!payload.bedBody.geometry)throw Error('Missing bed body geometry: '+id);
 for(const key of ['sofaSocial','sofaBody','idleChair']){if(!leisureGeometry[key][id])throw Error('Missing '+key+' geometry: '+id);payload[key]={geometry:leisureGeometry[key][id],url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-motion-v20/'+id+'-'+key+'.png',import.meta.url))).toString('base64')};}
 delete payload.bedReference;delete payload.sleepReference;delete payload.bed;delete payload.sleepMotion;
 await writeFile(new URL('./lib/client.wardrobe-'+id+'-v20.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.wardrobe-'+id+'-v20.js",factory:()=>('+JSON.stringify(payload)+')});\n');
}
await writeFile(new URL('./lib/client.room-art-v7.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-art-v7.js",factory:()=>('+JSON.stringify(roomImages)+')});\n');
const roomV12={...roomImages,mirror:await inlineRoomAsset('floor-two-mirror-v12.png')};
await writeFile(new URL('./lib/client.room-art-v12.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-art-v12.js",factory:()=>('+JSON.stringify(roomV12)+')});\n');
const lifeGeometry=JSON.parse(await read('./assets/room-life-v11/geometry.json')),lifeAtlases={};
for(const name of Object.keys(lifeGeometry))lifeAtlases[name]='data:image/png;base64,'+(await readFile(new URL(name==='walk'?'./assets/room-actions/walk-v3.png':'./assets/'+(name==='sofa-rest'?'room-life-v11/':'room-life-v10/')+name+'.png',import.meta.url))).toString('base64');
const lifePayload={version:11,geometry:lifeGeometry,atlases:lifeAtlases,greenhouse:'data:image/png;base64,'+(await readFile(new URL('./assets/room-life-v10/greenhouse.png',import.meta.url))).toString('base64')};
await writeFile(new URL('./lib/client.room-life-v11.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-life-v11.js",factory:()=>('+JSON.stringify(lifePayload)+')});\n');
lifePayload.geometry={...lifeGeometry,...JSON.parse(await read('./assets/room-life-v16/geometry.json'))};
lifePayload.atlases={...lifeAtlases,'bed-entry':'data:image/png;base64,'+(await readFile(new URL('./assets/room-life-v16/bed.png',import.meta.url))).toString('base64')};
lifePayload.revision=16;
lifePayload.bedding='data:image/png;base64,'+(await readFile(new URL('./assets/room-life-v16/bedding.png',import.meta.url))).toString('base64');
await writeFile(new URL('./lib/client.room-life-v16.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-life-v16.js",factory:()=>('+JSON.stringify(lifePayload)+')});\n');
lifePayload.revision=17;lifePayload.geometry={...lifePayload.geometry,transition:transitionGeometry.original};lifePayload.atlases={...lifePayload.atlases,transition:'data:image/png;base64,'+(await readFile(new URL('./assets/room-transition-v17/original.png',import.meta.url))).toString('base64')};lifePayload.mattress='data:image/png;base64,'+(await readFile(new URL('./assets/room-transition-v17/mattress.png',import.meta.url))).toString('base64');
lifePayload.geometry.sleepMotion=supplementGeometry.sleep.original;lifePayload.atlases.sleepMotion='data:image/png;base64,'+(await readFile(new URL('./assets/room-transition-v17/original-sleep.png',import.meta.url))).toString('base64');
lifePayload.quilt={url:'data:image/png;base64,'+(await readFile(new URL('./assets/room-transition-v17/quilt.png',import.meta.url))).toString('base64'),width:1536,height:1024,crop:[114,91,1339,873]};
await writeFile(new URL('./lib/client.room-life-v17.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-life-v17.js",factory:()=>('+JSON.stringify(lifePayload)+')});\n');
lifePayload.revision=19;lifePayload.geometry.bedReference=bedReferenceGeometry.original;lifePayload.atlases.bedReference='data:image/png;base64,'+(await readFile(new URL('./assets/room-bed-reference-v19/original-fixed.png',import.meta.url))).toString('base64');
lifePayload.geometry.sleepReference=sleepReferenceGeometry.original;lifePayload.atlases.sleepReference='data:image/png;base64,'+(await readFile(new URL('./assets/room-bed-reference-v19/original-sleep.png',import.meta.url))).toString('base64');lifePayload.foldedQuilt='data:image/png;base64,'+(await readFile(new URL('./assets/room-bed-reference-v19/folded.png',import.meta.url))).toString('base64');
await writeFile(new URL('./lib/client.room-life-v19.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-life-v19.js",factory:()=>('+JSON.stringify(lifePayload)+')});\n');
lifePayload.revision=20;lifePayload.geometry.bedBody=bedBodyGeometry.original;lifePayload.atlases.bedBody='data:image/png;base64,'+(await readFile(new URL('./assets/room-motion-v20/original-bed.png',import.meta.url))).toString('base64');
for(const key of ['sofaSocial','sofaBody','idleChair']){lifePayload.geometry[key]=leisureGeometry[key].original;lifePayload.atlases[key]='data:image/png;base64,'+(await readFile(new URL('./assets/room-motion-v20/original-'+key+'.png',import.meta.url))).toString('base64');}
lifePayload.chairCleanplate='data:image/png;base64,'+(await readFile(new URL('./assets/room-motion-v20/chair-cleanplate.png',import.meta.url))).toString('base64');
delete lifePayload.quilt;
for(const name of ['bedReference','sleepReference','sleepMotion','bed-entry']){delete lifePayload.geometry[name];delete lifePayload.atlases[name];}
await writeFile(new URL('./lib/client.room-life-v20.js',import.meta.url),'window.__ModuleLoader__.load({id:"dsh-whale-status",chunk:"client.room-life-v20.js",factory:()=>('+JSON.stringify(lifePayload)+')});\n');
const bridge = await bundleModule('./src/frame-bridge.mjs');
const actions = Object.keys(new CompanionService({}).handlers);
const bookStorage = await bundleModule('./src/room-book-storage.mjs');
const built = template.replace('__PANEL_HTML__', () => JSON.stringify(html)).replace('__ALLOWED_ACTIONS__', () => JSON.stringify(actions)).replace('__FRAME_BRIDGE__', () => bridge).replace('__BOOK_STORAGE__', () => bookStorage);
await writeFile(new URL('./lib/client.js', import.meta.url), built, 'utf8');
await writeFile(new URL('./lib/panel-built.html', import.meta.url), html, 'utf8');
console.log('Built DSH client: lib/client.js');
