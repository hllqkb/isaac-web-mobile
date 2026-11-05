import{createReaderFetch}from'./reader_guard.mjs';
// Immutable raw chunks verified against the hosted APK release inventory.
export const CHUNKS = [{"path":"./chunks/a/a0.bin?v=186cb3ec","bytes":4383373,"sha256":"186cb3ec8341740fb0f2a131988314f6f78101bf6a579eeb76f0a51cbfab115d"},{"path":"./chunks/a/a1.bin?v=b65d0e46","bytes":3568750,"sha256":"b65d0e4616bdbc72b20e8f5e5cc19bfd117b98ad89ea1c0cb438f2c28da1548d"},{"path":"./chunks/a/a2.bin?v=492e1198","bytes":4680381,"sha256":"492e1198f5162edf2934ecfb782b6e0262c97a1fe11e3b6f3583b71a4f7605ec"},{"path":"./chunks/a/a3.bin?v=352da992","bytes":11048525,"sha256":"352da992d3bd2d273bb9d56b73382eedf20a37eabb5ea37997767e5162cb7bae"},{"path":"./chunks/b/b0.bin?v=bfa2c52b","bytes":2366223,"sha256":"bfa2c52bd3d68158d0fb1570281fdcf1bf64b0357c3a12036f6ea8b1ac78920c"},{"path":"./chunks/b/b1.bin?v=58fee6e0","bytes":3056018,"sha256":"58fee6e022cd0c8e1005d8bc246520c5206860010e75db20266cab3c2bc98576"},{"path":"./chunks/b/b2.bin?v=7bf61e8a","bytes":14149901,"sha256":"7bf61e8a2ae105b88251700bcc2875c3f0f2e9c257e3f89e3dba03df94b7753d"},{"path":"./chunks/b/b3.bin?v=9277f636","bytes":17418976,"sha256":"9277f636b1a0b04d49cb7294d9e25dbe88bca9242c984b347d5c9771ec27d253"},{"path":"./chunks/b/b4.bin?v=e89ba1ea","bytes":2429849,"sha256":"e89ba1eaa6dd4a9cff6b981a024c58f0c3a2c970c7a39c068e1e737a43619e48"},{"path":"./chunks/b/b5.bin?v=f09a6f53","bytes":2441530,"sha256":"f09a6f53a5e464a159bde80630de5749c887408af354236f7d72a1c93823f927"},{"path":"./chunks/b/b6.bin?v=0fa79499","bytes":1901408,"sha256":"0fa794992f2b99b599d7e3ea262ec64f9e245aa3740511be15250be70a5a2fce"},{"path":"./chunks/b/b7.bin?v=db1c7803","bytes":2196737,"sha256":"db1c7803773703841a18b7dd00564941de1f5956a9ea00a32c20262213f0c041"},{"path":"./chunks/b/b8.bin?v=5fcbcf1d","bytes":1944510,"sha256":"5fcbcf1d9d424afdbba9ffd3c75fc4a9b1df1affaa2e98a1bd92fe892ddfe4aa"},{"path":"./chunks/b/b9.bin?v=50e74152","bytes":1845822,"sha256":"50e74152933278ef1e36050354ce23a2cebb1cc226866b3ae6409bee5e905eb8"},{"path":"./chunks/b/b10.bin?v=e27a1b56","bytes":2499645,"sha256":"e27a1b560d0a34044f62eebcf66bc38031200ec526ff2e767b5eea5d5ee66de8"},{"path":"./chunks/b/b11.bin?v=a0aa107f","bytes":6556463,"sha256":"a0aa107fb69f3f397c446d3c1025310053f7b52f9f352227049857e4375a05ad"},{"path":"./chunks/b/b12.bin?v=a570c7d3","bytes":15380102,"sha256":"a570c7d39b6e0f5be508bd192b2adcc49d6b0929ea4acb2a302c4c8929319769"},{"path":"./chunks/b/b13.bin?v=6cbad5ee","bytes":19884633,"sha256":"6cbad5ee58ae949eff1de468120191e23d322db361225b39fe3358ebea5b8378"},{"path":"./chunks/b/b14.bin?v=683c7b75","bytes":19906247,"sha256":"683c7b75a5b9f0cf4662b36897289a44566328da8b7a1030e0da98d399ab405a"},{"path":"./chunks/b/b15.bin?v=cf887cf4","bytes":19825774,"sha256":"cf887cf48c151b61a5a4da9e44a7759977b90ab2e18cca35b046e59f9fcff281"},{"path":"./chunks/b/b16.bin?v=7dcdb961","bytes":2908280,"sha256":"7dcdb961c1d1bccf1166c08a9fc057c8b52e500bd471c9920ce2d21b3eab294f"},{"path":"./chunks/b/b17.bin?v=5c609381","bytes":1357519,"sha256":"5c6093810ddab9e77b0477c07cc78c5aff1119f7350e55cc25e7748b84b9c308"},{"path":"./chunks/b/b18.bin?v=abdf8cb9","bytes":496304,"sha256":"abdf8cb93c999d859364193e1425917823b78939eebbb4109f82ff7e1cab77d8"},{"path":"./chunks/b/b19.bin?v=c94ce09a","bytes":5942841,"sha256":"c94ce09ac7e078590025232132bc84242dfaeefa0f5467fef4d60c0b7213901a"},{"path":"./chunks/b/b20.bin?v=2a210d37","bytes":13380527,"sha256":"2a210d37722a8dc48990f5a40b3d81cfb91f4c4bc29f5de81f37e75266b99ab5"},{"path":"./chunks/b/b21.bin?v=17aeb67c","bytes":17046631,"sha256":"17aeb67c7d9034a8ae42fe5c9545198fa7c7ebe75a6b1b23d5ee5145863c6fc5"},{"path":"./chunks/b/b22.bin?v=060c04ae","bytes":19922944,"sha256":"060c04ae6e9ef6e4033d511c9e0015aba557dee7800dc5a600dd59571dc44e7d"},{"path":"./chunks/b/b23.bin?v=a0c1a898","bytes":19842404,"sha256":"a0c1a8984d900fbe362b7d852a240f6d23c68f79403f2680fc9de065719ee082"},{"path":"./chunks/b/b24.bin?v=2786403f","bytes":10161846,"sha256":"2786403f80d5ddfa6ec8916ab1b41c7217897c5d8c821e9093d14d99dadc130c"},{"path":"./chunks/b/b25.bin?v=0e77395a","bytes":4326053,"sha256":"0e77395a9e4a11fc2546f84098b98a40cae3fc90b27c545dcab18398afecbce0"},{"path":"./chunks/b/b26.bin?v=74cdb100","bytes":6975314,"sha256":"74cdb10071816f4947ee34eaab370ee01f4e4e2ecaa3d6a3cd43efc8bbda55e5"},{"path":"./chunks/b/b27.bin?v=129e7ba1","bytes":19922944,"sha256":"129e7ba1073439bb39aa45a1cfb687c61161d5536a1ab180376bee3216021779"},{"path":"./chunks/b/b28.bin?v=a43a7c5b","bytes":19922944,"sha256":"a43a7c5b40176a3cfbe1763c71a0557655f5ecbce50db7fc411664614fa4e362"},{"path":"./chunks/b/b29.bin?v=c909ffc5","bytes":19489380,"sha256":"c909ffc5efae301cf9cae4ceb118569862dc7b6a41ca281a7a8200cf4940e489"},{"path":"./chunks/b/b30.bin?v=7fbfff8e","bytes":19922944,"sha256":"7fbfff8e3537c97a850e2153aa9caed6cd917cca3fca44b7b484c7ae0188cfff"},{"path":"./chunks/b/b31.bin?v=e9d943cc","bytes":19922944,"sha256":"e9d943cc621c1418cce46a6d51caf0e4e77a8ad90ba46aa7b38fb3f497cca125"},{"path":"./chunks/b/b32.bin?v=ddbe73fb","bytes":19922944,"sha256":"ddbe73fb5bad6e86c0ed92acb1b30f7457d413401fc01995846070aee6144e8c"},{"path":"./chunks/b/b33.bin?v=cec95fbf","bytes":12121806,"sha256":"cec95fbf533bc8888af0dabb7b4c3897530be7655ab8e5a041407baa597ac8cf"}];
export function createVerifiedChunkCache({entries=CHUNKS,baseUrl=globalThis.location?.href,
  cacheStorage=globalThis.caches,request=globalThis.fetch?.bind(globalThis),crypto=globalThis.crypto,
  cacheMs=1500,cacheName='isaac-raw-chunks-v1-d097d9ae',now=()=>performance.now(),
  retryWait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),segmentBytes=1048576,concurrency=16}={}) {
  const validateConcurrency=value=>{
    if(!Number.isInteger(value)||value<1||value>128)throw new RangeError('invalid concurrency: expected an integer from 1 to 128');
    return value;
  };
  concurrency=validateConcurrency(concurrency);
  if(!Number.isSafeInteger(segmentBytes)||segmentBytes<1)throw Error('invalid segment size');
  const canonical=url=>{const u=new URL(url,baseUrl);u.hash='';u.searchParams.delete('w');return u.href;};
  const known=new Map(entries.map(entry=>[canonical(entry.path||entry.url),entry]));
  const blobs=new Map(),loading=new Map();let blobBytes=0;
  const pendingVerified=new Map(),pendingSegments=new Map(),active=new Map(),controllers=new Set();
  const rateBuckets=Array.from({length:80},()=>({at:-1,bytes:0}));
  let firstTransfer=null,stopped=false,paused=false;
  const memo=(key,blob)=>{if(blobs.has(key)){blobBytes-=blobs.get(key).size;blobs.delete(key);}blobs.set(key,blob);blobBytes+=blob.size;while(blobs.size>2||blobBytes>40*1048576){const first=blobs.keys().next().value;blobBytes-=blobs.get(first).size;blobs.delete(first);}};
  const state={active:false,received:0,total:[...known.values()].reduce((n,e)=>n+e.bytes,0),completed:0,hits:0,misses:0,error:null,downloadedBytes:0};
  const bounded=async(operation,ms)=>{let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('chunk cache wait timeout')),ms);})]);}finally{clearTimeout(timer);}};
  const valid=(response,entry)=>response?.status===200&&response.headers.get('x-isaac-sha256')===entry.sha256&&response.headers.get('content-length')===String(entry.bytes);
  async function cachedBlob(key,entry) {
    if(blobs.has(key)){const blob=blobs.get(key);blobs.delete(key);blobs.set(key,blob);return blob;}
    if(loading.has(key))return loading.get(key);
    const load=bounded(async()=>{
      const cache=await cacheStorage.open(cacheName),response=await cache.match(key);
      if(!valid(response,entry))return null;
      const stored=await response.blob();
      return stored.size===entry.bytes?stored:null;
    },cacheMs);
    const shared=load.then(blob=>{if(blob)memo(key,blob);return blob;}).finally(()=>loading.delete(key));
    loading.set(key,shared);
    return shared;
  }
  async function readRange(url,init={}) {
    const key=canonical(url),entry=known.get(key);
    const range=new Headers(init.headers).get('range');
    if(!entry||!range||!range.startsWith('bytes=')){state.misses++;return null;}
    const parts=range.slice(6).split('-'),from=Number(parts[0]),to=Number(parts[1]);
    if(!/^[0-9]+-[0-9]+$/.test(range.slice(6))||parts.length!==2||!parts[0]||!parts[1]||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>=entry.bytes){state.misses++;return null;}
    try {
      const blob=await cachedBlob(key,entry);
      if(!blob){state.misses++;return null;}
      state.hits++;
      return new Response(blob.slice(from,to+1),{status:206,headers:{'content-type':'application/octet-stream','content-length':String(to-from+1),'content-range':'bytes '+from+'-'+to+'/'+entry.bytes}});
    } catch {state.misses++;return null;}
  }
  async function readWhole(url) {
    const key=canonical(url),entry=known.get(key);
    if(!entry){state.misses++;return null;}
    try {
      const blob=await cachedBlob(key,entry);
      if(!blob){state.misses++;return null;}
      state.hits++;
      return new Response(blob,{status:200,headers:{'content-type':'application/octet-stream','content-length':String(entry.bytes)}});
    } catch {state.misses++;return null;}
  }
  function transferred(bytes) {
    const time=now(),at=Math.floor(time/250),bucket=rateBuckets[at%rateBuckets.length];
    if(bucket.at!==at){bucket.at=at;bucket.bytes=0;}
    bucket.bytes+=bytes;state.downloadedBytes+=bytes;
    if(firstTransfer===null)firstTransfer=time;
  }
  const partUrl=(file,part)=>{const url=new URL(file.key);url.searchParams.set('__isaac_sha',file.entry.sha256);url.searchParams.set('__isaac_part',part.from+'-'+part.to);return url.href;};
  const partHeaders=(file,part)=>({'content-length':String(part.length),'x-isaac-sha256':file.entry.sha256,'x-isaac-from':String(part.from),'x-isaac-to':String(part.to),'x-isaac-total':String(file.entry.bytes)});
  const abortError=()=>{const error=Error('download paused');error.name='AbortError';return error;};
  async function digest(blob) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function download(file,part,info,probe) {
    for(let attempt=1;attempt<=3;attempt++) {
      if(stopped)throw paused?abortError():Error('download stopped');
      info.attempt=attempt;info.retrying=attempt>1||file.hashFailures>0;
      let received=0,contribution=0,reader,unlink=()=>{};
      const controller=new AbortController();controllers.add(controller);
      const network=createReaderFetch({fetch:(url,init)=>{
        const abort=()=>controller.abort();init.signal.addEventListener('abort',abort,{once:true});
        unlink=()=>init.signal.removeEventListener('abort',abort);
        return request(url,{...init,signal:controller.signal});
      }});
      try {
        const url=new URL(file.key);url.searchParams.set('w',part.from+'-'+part.to);
        const response=await network(url.href,{headers:{Range:'bytes='+part.from+'-'+part.to}});
        if(stopped){await response.body?.cancel();throw paused?abortError():Error('download stopped');}
        const whole=response.status===200&&probe;
        const range='bytes '+part.from+'-'+part.to+'/'+file.entry.bytes;
        if(!whole&&(response.status!==206||response.headers.get('content-range')?.trim()!==range)){
          await response.body?.cancel();throw Error('invalid segment Content-Range or HTTP '+response.status);
        }
        const size=whole?file.entry.bytes:part.length,length=response.headers.get('content-length');
        if(whole&&response.headers.get('content-range')){await response.body?.cancel();throw Error('invalid whole Content-Range');}
        if(length!==null&&length!==String(size)){await response.body?.cancel();throw Error('segment header length mismatch');}
        if(!response.body?.getReader)throw Error('streaming response is required');
        reader=response.body.getReader();const parts=[];
        for(;;){const item=await reader.read();if(item.done)break;
          if(item.value.byteLength){received+=item.value.byteLength;transferred(item.value.byteLength);
            const next=whole?Math.max(0,received-file.readyBytes):received;
            state.received+=next-contribution;contribution=next;info.received=received;}
          if(received>size)throw Error('segment body too large');parts.push(item.value);
        }
        if(received!==size)throw Error('segment body length mismatch');
        const blob=new Blob(parts);
        if(whole&&await digest(blob)!==file.entry.sha256)throw Error('full chunk SHA-256 mismatch');
        return {blob,whole};
      }catch(error){
        if(reader)await reader.cancel(error);state.received-=contribution;info.received=0;
        if(stopped||attempt===3)throw paused?abortError():Error(file.entry.path+': '+String(error.message||error));
        info.retrying=true;await retryWait(250*attempt);
      }finally{unlink();controller.abort();controllers.delete(controller);reader?.releaseLock?.();}
    }
  }
  let running=null;
  function setConcurrency(value) {
    if(running)throw Error('download is active; pause before changing concurrency');
    concurrency=validateConcurrency(value);return concurrency;
  }
  function pause() {
    paused=true;stopped=true;for(const controller of controllers)controller.abort();
    return running?running.catch(()=>undefined).then(()=>summary()):Promise.resolve(summary());
  }
  function preload() {
    if(running)return running;
    running=(async()=>{
      state.active=true;state.received=0;state.completed=0;state.error=null;stopped=false;paused=false;
      firstTransfer=null;for(const bucket of rateBuckets){bucket.at=-1;bucket.bytes=0;}
      try {
        const cache=await bounded(()=>cacheStorage.open(cacheName),cacheMs);
        const files=[];
        for(const [key,entry] of known){
          if(stopped)throw abortError();
          if(valid(await bounded(()=>cache.match(key),cacheMs),entry)){pendingVerified.delete(key);state.received+=entry.bytes;state.completed++;continue;}
          const file={key,entry,parts:[],missing:[],readyBytes:0,whole:false,hashFailures:0};
          for(let from=0;from<entry.bytes;from+=segmentBytes){const to=Math.min(entry.bytes,from+segmentBytes)-1;file.parts.push({from,to,length:to-from+1});}
          files.push(file);
        }
        if(stopped)throw paused?abortError():Error('download stopped');
        if(!files.length){state.active=false;return summary();}
        const partial=await bounded(()=>cacheStorage.open(cacheName+'-segments-v1'),cacheMs);
        for(const [key,item] of pendingSegments){await bounded(()=>partial.put(key,new Response(item.blob,{status:200,headers:item.headers})),5000);pendingSegments.delete(key);}
        for(const file of files){
          if(pendingVerified.has(file.key)){file.readyBytes=file.entry.bytes;state.received+=file.readyBytes;continue;}
          for(const part of file.parts){
            if(stopped)throw abortError();
            const key=partUrl(file,part),response=await bounded(()=>partial.match(key),cacheMs),headers=partHeaders(file,part);
            const validPart=response?.status===200&&Object.entries(headers).every(([name,value])=>response.headers.get(name)===value);
            if(validPart&&(await bounded(()=>response.blob(),cacheMs)).size===part.length){file.readyBytes+=part.length;state.received+=part.length;}
            else {if(response)await bounded(()=>partial.delete(key),cacheMs);file.missing.push(part);}
          }
        }
        async function clearParts(file){for(const part of file.parts)await bounded(()=>partial.delete(partUrl(file,part)),cacheMs);}
        async function writeWhole(file,blob){
          pendingVerified.set(file.key,blob);
          await bounded(()=>cache.put(file.key,new Response(blob,{status:200,headers:{'content-length':String(file.entry.bytes),'x-isaac-sha256':file.entry.sha256}})),5000);
          pendingVerified.delete(file.key);file.whole=true;file.readyBytes=file.entry.bytes;state.completed++;
          await clearParts(file);
        }
        for(;;){
          const jobs=[];for(const file of files)if(!file.whole&&file.missing.length)jobs.push({file,part:file.missing[0],probe:true});
          let next=0,inFlight=0,failure=null;const wakes=new Set();
          const wake=()=>{for(const resolve of wakes)resolve();wakes.clear();};
          async function worker(){
            while(!stopped){
              if(next>=jobs.length){if(!inFlight)return;await new Promise(resolve=>wakes.add(resolve));continue;}
              const job=jobs[next++],{file,part,probe}=job,key=partUrl(file,part);
              const info={file:file.entry.path,from:part.from,to:part.to,attempt:0,retrying:file.hashFailures>0,received:0};
              active.set(key,info);inFlight++;
              try {
                const result=await download(file,part,info,probe);
                if(result.whole)await writeWhole(file,result.blob);
                else {
                  const item={blob:result.blob,headers:partHeaders(file,part)};pendingSegments.set(key,item);
                  await bounded(()=>partial.put(key,new Response(item.blob,{status:200,headers:item.headers})),5000);
                  pendingSegments.delete(key);file.readyBytes+=part.length;
                  if(probe)for(const rest of file.missing.slice(1))jobs.push({file,part:rest,probe:false});
                }
              }catch(error){if(!failure)failure=error;stopped=true;for(const controller of controllers)controller.abort();}
              finally{active.delete(key);inFlight--;wake();}
            }
          }
          await Promise.all(Array.from({length:concurrency},()=>worker()));
          if(failure)throw failure;if(stopped)throw abortError();
          let retry=false;
          for(const file of files){
            if(stopped)throw paused?abortError():Error('download stopped');
            if(file.whole)continue;
            let blob=pendingVerified.get(file.key);
            if(!blob){
              const parts=[];
              for(const part of file.parts){if(stopped)throw abortError();const response=await bounded(()=>partial.match(partUrl(file,part)),cacheMs);if(!response)throw Error('missing cached segment');const piece=await bounded(()=>response.blob(),cacheMs);if(piece.size!==part.length)throw Error('cached segment body length mismatch');parts.push(piece);}
              blob=new Blob(parts);
              if(blob.size!==file.entry.bytes||await digest(blob)!==file.entry.sha256){
                await clearParts(file);state.received-=file.readyBytes;file.readyBytes=0;file.missing=file.parts;
                if(++file.hashFailures>=3)throw Error(file.entry.path+': full chunk SHA-256 mismatch');
                retry=true;continue;
              }
            }
            await writeWhole(file,blob);
          }
          if(!retry)break;
        }
        if(stopped)throw paused?abortError():Error('download stopped');
        state.active=false;return summary();
      }catch(error){state.error=String(error.message||error);throw error;}
      finally{state.active=false;running=null;active.clear();}
    })();return running;
  }
  const summary=()=>{
    const time=now(),current=Math.floor(time/250);
    let bytes=0;for(const bucket of rateBuckets)if(bucket.at<=current&&bucket.at>current-20)bytes+=bucket.bytes;
    const elapsed=firstTransfer===null?0:Math.min(5000,time-firstTransfer);
    const bytesPerSecond=elapsed>=250?bytes/(elapsed/1000):0;
    const files=[...active.values()].map(info=>({...info}));
    const selected=files.find(info=>info.retrying)||files[0];
    const etaSeconds=state.completed===known.size?0:bytesPerSecond>0?Math.max(0,state.total-state.received)/bytesPerSecond:null;
    return {...state,concurrency,totalFiles:known.size,complete:state.completed===known.size&&!state.active&&!paused&&!stopped&&!state.error,paused,bytesPerSecond,etaSeconds,activeFiles:files.length,networkTasks:files.length,files,
      retrying:files.some(info=>info.retrying),currentFile:selected?.file||null,attempt:selected?.attempt||0,
      memoizedBlobs:blobs.size,memoizedBytes:blobBytes};
  };
  return {preload,pause,setConcurrency,readRange,readWhole,summary,canonical};
}
