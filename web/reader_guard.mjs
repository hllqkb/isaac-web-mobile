// Bound network inactivity in the reader Worker; decoding keeps its own lifetime.
export function createReaderFetch({fetch:fetchImpl,headerMs=30000,idleMs=30000,now=()=>performance.now()}={}) {
  return async function readerFetch(url,init={}) {
    const controller=new AbortController();
    const cancel=operation=>{try{Promise.resolve(operation()).catch(()=>{});}catch{}};
    const bounded=async(operation,ms,phase)=>{
      let timer;
      try {
        return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{
          timer=setTimeout(()=>{
            reject(new Error('reader '+phase+' timeout'));
            controller.abort();
          },Math.max(1,ms));
        })]);
      } finally {clearTimeout(timer);}
    };
    const response=await bounded(()=>fetchImpl(url,{...init,signal:controller.signal}),headerMs,'headers');
    let reader,lastProgress=now();
    const body=response.body?.getReader?{
      getReader(){
        reader=response.body.getReader();
        return {
          async read(){
            try {
              const part=await bounded(()=>reader.read(),idleMs-(now()-lastProgress),'body');
              if(part.value?.byteLength)lastProgress=now();
              if(part.done)reader.releaseLock?.();
              return part;
            } catch(error) {cancel(()=>reader.cancel(error));throw error;}
          },
          cancel(reason){cancel(()=>reader.cancel(reason));controller.abort();return Promise.resolve();}
        };
      },
      cancel(reason){cancel(()=>response.body.cancel(reason));controller.abort();return Promise.resolve();}
    }:null;
    return {ok:response.ok,status:response.status,headers:response.headers,body,
      arrayBuffer:()=>bounded(()=>response.arrayBuffer(),idleMs,'body')};
  };
}
