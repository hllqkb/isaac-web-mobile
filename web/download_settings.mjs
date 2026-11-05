export const DOWNLOAD_CONCURRENCY_OPTIONS=Object.freeze([4,8,16,32,64,128]);
const key='isaac-download-concurrency';
let fallback=16,memoryOnly=false;
export function getDownloadConcurrency() {
  if(memoryOnly)return fallback;
  try {
    const value=Number(localStorage.getItem(key));
    return DOWNLOAD_CONCURRENCY_OPTIONS.includes(value)?value:fallback;
  }catch{return fallback;}
}
export function setDownloadConcurrency(value) {
  const count=Number(value);
  if(!DOWNLOAD_CONCURRENCY_OPTIONS.includes(count))throw new RangeError('无效的下载并发设置');
  fallback=count;
  try{localStorage.setItem(key,String(count));memoryOnly=false;}catch{memoryOnly=true;}
  return count;
}
