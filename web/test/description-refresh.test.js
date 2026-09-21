import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { renderDataFreshness } from '../public/data-freshness.js';
function section(html,start,end) {
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert(a>=0 && b>a); return html.slice(a,b);
}
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function page(fetchJson) {
  const context=vm.createContext({fetchJson,manifest:null,renderDataFreshness,document:{querySelector:()=>({})},MANIFEST_URL:'/manifest.json',
    LEGACY_URLS:{hot:'/legacy-hot.json',search:'/legacy-search.json'},
    generatedAt:null,skillsCount:{},allCount:{},formatStars:String,makeEntries:rows=>rows,
    updateAllCount(){},updateCategoryCounts(){},console:{warn(){}},
    initialDataPromise:null,searchEntries:null,searchLoadPromise:null,
    loadLegacyTotalEntries(){throw new Error('legacy full must not be called');}});
  vm.runInContext(section(html,'      async function loadManifestAndHot()','      async function ensureViewData(')+
    section(html,'      async function loadSearchEntries()','      function formatStars('),context);
  return context;
}
test('website never downgrades after observing the current manifest',async()=>{
  const requests=[];
  const current={schemaVersion:2,datasets:{hot:{url:'/snapshots/current/hot.json'},search:{url:'/snapshots/current/search.json'}}};
  const context=page(async url=>{requests.push(url); if(url==='/manifest.json') return current; throw new Error('offline');});
  await assert.rejects(context.loadManifestAndHot(),/offline/);
  await assert.rejects(context.loadSearchEntries(),/offline/);
  assert.deepEqual(requests,['/manifest.json','/snapshots/current/hot.json','/snapshots/current/search.json']);
});
test('website permits legacy discovery only for a missing manifest',async()=>{
  for(const status of [404,503]) {
    const requests=[];
    const context=page(async url=>{requests.push(url);if(url==='/manifest.json') throw Object.assign(new Error('unavailable'),{status});
      return {rankings:[{fullName:'fixture/legacy'}]};});
    if(status===404) {await context.loadManifestAndHot();assert.equal(requests[1],'/legacy-hot.json');}
    else {await assert.rejects(context.loadManifestAndHot(),/unavailable/);assert.equal(requests.length,1);}
  }
});
test('mutable legacy files revalidate while immutable snapshots may use the browser cache',async()=>{
  const requests=[];
  const context=vm.createContext({dataLoadPromises:new Map(),fetch:async(url,options)=>{
    requests.push(options.cache);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({})};}});
  vm.runInContext(section(html,'      async function fetchJson(','      function makeEntries('),context);
  await context.fetchJson('/data/manifest.json',{manifestRequest:true});
  await context.fetchJson('/data/rankings-search.json');
  await context.fetchJson('/data/snapshots/current/search.json');
  assert.deepEqual(requests,['no-cache','no-cache','force-cache']);
});
test('Skills refuses old full catalog after the current directory fails',async()=>{
  const skills=readFileSync(new URL('../public/skills.html',import.meta.url),'utf8');
  const requests=[];
  const context=vm.createContext({MANIFEST_URL:'/manifest.json',fetchJson:async url=>{
    requests.push(url);if(url==='/manifest.json') return {datasets:{skills:{url:'/snapshots/current/skills.json'}}};
    throw new Error('offline');}});
  vm.runInContext(section(skills,'      async function load()','      search.addEventListener('),context);
  await assert.rejects(context.load(),/offline/);
  assert.deepEqual(requests,['/manifest.json','/snapshots/current/skills.json']);
});
