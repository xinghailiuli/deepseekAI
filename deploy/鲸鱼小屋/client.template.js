window.__ModuleLoader__.load({
  id: 'dsh-whale-status',
  factory: (require) => {
    const React = require('react');
    const panelHtml = __PANEL_HTML__;
    let roomAssets,lifeAssets,roomRuntime;
    const roomRuntimeKey='liuli-companion:room-runtime:v1';
    try{roomRuntime=JSON.parse(localStorage.getItem(roomRuntimeKey)||'null');}catch{}
    const wardrobeIds=new Set(__WARDROBE_IDS__),wardrobeLoads=new Map(),wardrobeKey='liuli-companion:wardrobe:v1';
    const allowedActions = new Set(__ALLOWED_ACTIONS__);
    const loadWhaleChunk = async (chunkName) => {
      try {
        const entry = window.__DSH_BOOT__?.entries?.find(e => e.id === 'dsh-whale-status');
        const rev = entry?.rev || '';
        const url = `/plugins/dsh-whale-status/${chunkName}${rev ? `?rev=${rev}` : ''}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const code = await resp.text();
          let loaded = null;
          const prev = window.__ModuleLoader__.load;
          window.__ModuleLoader__.load = function(reg) {
            if (reg.id === 'dsh-whale-status' && reg.chunk === chunkName) {
              loaded = reg.factory();
            } else {
              prev.apply(this, arguments);
            }
          };
          try {
            (0, eval)(code);
          } finally {
            window.__ModuleLoader__.load = prev;
          }
          if (loaded) return loaded;
        }
      } catch (err) {
        console.warn('[WHALE HOST] direct chunk fetch exception:', err);
      }
      if (typeof require?.async === 'function') {
        return await require.async('./' + chunkName);
      }
      throw new Error(`Cannot load chunk: ${chunkName}`);
    };
    __FRAME_BRIDGE__
    __BOOK_STORAGE__
    const requestBooks=createRoomBookStorage(window.indexedDB);
    const PANEL_ID = 'whale-status';
    function StatusPanel() {
      const frame = React.useRef(null);
      React.useEffect(() => attachFrameBridge(window, () => frame.current?.contentWindow, allowedActions), []);
      React.useEffect(()=>{
        let active=true;
        const receive=async event=>{
          const target=frame.current?.contentWindow,d=event.data;
          if(!target||event.source!==target||d?.channel!=='liuli-companion')return;
          if(d.type==='room-assets-request'){sendRoomAssets();return;}
          if(d.type==='book-request'&&typeof d.requestId==='string'&&d.requestId.length<100){
            try{const value=await requestBooks(d.op,d.value);if(active&&target===frame.current?.contentWindow)target.postMessage({channel:'liuli-companion',type:'book-response',requestId:d.requestId,value},'*');}
            catch(error){if(active&&target===frame.current?.contentWindow)target.postMessage({channel:'liuli-companion',type:'book-response',requestId:d.requestId,error:error.message},'*');}return;
          }
          if(d.type==='room-runtime-request'){target.postMessage({channel:'liuli-companion',type:'room-runtime',value:roomRuntime},'*');return;}
          if(d.type==='room-runtime-save'){
            if(d.value?.version===1&&Number.isFinite(d.value.savedAt)){try{const json=JSON.stringify(d.value);if(json.length<131072){roomRuntime=JSON.parse(json);localStorage.setItem(roomRuntimeKey,json);}}catch{}}return;
          }
          if(d.type==='wardrobe-selected'&&(d.id==='original'||wardrobeIds.has(d.id))){try{localStorage.setItem(wardrobeKey,d.id);}catch{}return;}
          if(d.type!=='wardrobe-request'||typeof d.requestId!=='string')return;
          let id=d.id;if(id===undefined){try{id=localStorage.getItem(wardrobeKey);}catch{}id=wardrobeIds.has(id)?id:'original';}
          if(id!=='original'&&!wardrobeIds.has(id))return;
          try{
            let assets=null;if(id!=='original'){if(!wardrobeLoads.has(id))wardrobeLoads.set(id,loadWhaleChunk('client.wardrobe-'+id+'-v20.js'));assets=await wardrobeLoads.get(id);}
            if(active&&target===frame.current?.contentWindow)target.postMessage({channel:'liuli-companion',type:'wardrobe-assets',id,requestId:d.requestId,assets},'*');
          }catch(e){console.error('[WHALE HOST ERROR wardrobe]:', e);wardrobeLoads.delete(id);if(active&&target===frame.current?.contentWindow)target.postMessage({channel:'liuli-companion',type:'wardrobe-error',requestId:d.requestId},'*');}
        };
        window.addEventListener('message',receive);return()=>{active=false;window.removeEventListener('message',receive);};
      },[]);
      React.useEffect(()=>{
        let active=true;
        const receive=async event=>{
          const target=frame.current?.contentWindow;
          if(!target||event.source!==target||event.data?.channel!=='liuli-companion'||event.data.type!=='room-life-request')return;
          console.log('[WHALE HOST] received room-life-request');
          try{
            lifeAssets??=loadWhaleChunk('client.room-life-v20.js');
            const assets=await lifeAssets;
            console.log('[WHALE HOST] room-life-assets loaded, keys:', Object.keys(assets || {}));
            if(active&&target===frame.current?.contentWindow)target.postMessage({channel:'liuli-companion',type:'room-life-assets',assets},'*');
          }catch(e){
            console.error('[WHALE HOST ERROR room-life]:', e);
            lifeAssets=null;
            if(active&&target===frame.current?.contentWindow)target.postMessage({channel:'liuli-companion',type:'room-life-error'},'*');
          }
        };
        window.addEventListener('message',receive);return()=>{active=false;window.removeEventListener('message',receive);};
      },[]);
      const sendRoomAssets=async()=>{
        console.log('[WHALE HOST] sendRoomAssets called, hasTarget:', !!frame.current?.contentWindow);
        frame.current?.contentWindow?.postMessage({channel:"liuli-companion",type:"room-runtime",value:roomRuntime},"*");
        try{
          console.log('[WHALE HOST] requesting room-art chunk...');
          roomAssets??=loadWhaleChunk('client.room-art-v12.js');
          const assets=await roomAssets;
          console.log('[WHALE HOST] room-art loaded, keys:', Object.keys(assets || {}));
          frame.current?.contentWindow?.postMessage({channel:'liuli-companion',type:'room-assets',assets},'*');
          console.log('[WHALE HOST] room-assets posted successfully');
        }catch(e){
          console.error('[WHALE HOST ERROR room-art]:', e);
          roomAssets=null;
        }
      };
      return React.createElement('iframe', {
        ref: frame,
        title: '琉璃陪伴中心',
        srcDoc: panelHtml,
        onLoad:sendRoomAssets,
        sandbox: 'allow-scripts',
        style: { display: 'block', width: '100%', height: '100%', border: 0, minHeight: 0, background: '#0b171b' },
      });
    }
    function PanelIcon() {
      return React.createElement('svg', {
        width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, React.createElement('path', { d: 'M3 12a7 7 0 0 0 14 0c2 0 4-2 4-4-2 0-3 1-4 2a7 7 0 0 0-14 2Z' }),
      React.createElement('path', { d: 'M8 5V3m0 1L6 3m2 1 2-1' }),
      React.createElement('circle', { cx: 6.5, cy: 10.5, r: .6, fill: 'currentColor', stroke: 'none' }));
    }
    function apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, StatusPanel));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: '琉璃陪伴中心',
      }, PanelIcon));
    }
    return { name: 'dsh-whale-status', inject: ['slots', 'layout'], apply };
  },
});


