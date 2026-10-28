const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(`${__dirname}/app.js`,'utf8').replace(/^import .*;\n/,'');
async function screen({fail=false,delay=false,detailDelay=false}={}){
  const dom=new JSDOM(fs.readFileSync(`${__dirname}/index.html`,'utf8'),{url:'https://admin.example.test',runScripts:'outside-only'});
  const w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){}});
  const calls=[];const held=[];
  w.createClient=()=>({rpc(name,args){assert.equal(name,'admin_subscriber_details');calls.push({rpc:name,args});const result={data:{entity:{id:args.p_id,name:args.p_kind==='merchant'?'Commerce test':undefined,display_name:'Livreur test',siret:'12345678901234',phone:'0600000000'},account:{email:'abonne@example.test',encrypted_password:'must-not-render'},subscription:{status:'active',stripe_customer_id:'cus_test',trial_end:null}},error:null};return detailDelay?new Promise(resolve=>held.push(()=>resolve(result))):Promise.resolve(result)},auth:{getUser:async()=>({data:{user:{id:'admin',email:'admin@example.test'}}}),onAuthStateChange(){}},from(table){
    let head=false,range=null;
    const q={select(columns,options={}){head=options.head;calls.push({table,columns,options});return q},eq(){return q},order(){return q},range(a,b){range=[a,b];calls.push({table,range});return q},maybeSingle:async()=>({data:{user_id:'admin'}}),then(resolve,reject){
      let data=[];let count=table==='merchants'?26:0;
      if(table==='merchants'&&!head)data=[{id:'m1',name:'<img src=x onerror=alert(1)>',city:'Trappes',category:'Restaurant',is_published:true,is_paused:false,created_at:'2026-10-28'}];
      if(!head&&table==='couriers')data=[{id:'c1',display_name:'Livreur test',vehicle:'bike',work_zone:'Trappes',is_available:true}];
      if(!head&&table==='subscriptions')data=[{merchant_id:'m1',status:'active',plan:'pro',merchants:{name:'Commerce test'}}];
      if(!head&&table==='courier_subscriptions')data=[{courier_id:'c1',status:'active',plan:'pro',couriers:{display_name:'Livreur test'}}];
      const result={data, count, error:fail&&!head?{message:'Service indisponible'}:null};
      if(delay&&!head)return new Promise(r=>held.push(()=>r(result))).then(resolve,reject);
      return Promise.resolve(result).then(resolve,reject);
    }};return q;
  }});
  w.ZEEROO_ADMIN_CONFIG={supabasePublishableKey:'test'};w.eval(source);await new Promise(r=>setImmediate(r));
  const tab=async name=>{w.document.querySelector(`[data-tab="${name}"]`).click();await new Promise(r=>setImmediate(r))};
  return {w,calls,tab,held,close:()=>w.close()};
}
test('overview uses exact server counts for all five tables',async()=>{const s=await screen();try{assert.equal(s.w.document.querySelectorAll('.metric').length,6);assert.equal(s.w.document.querySelector('.metric strong').textContent,'26');assert.equal(s.calls.filter(c=>c.options?.head&&c.options?.count==='exact').length,6)}finally{s.close()}});
test('merchant list escapes database text and paginates 25 rows',async()=>{const s=await screen();try{await s.tab('merchants');assert.match(s.w.document.querySelector('tbody').textContent,/<img/);assert.equal(s.w.document.querySelector('tbody img'),null);assert.deepEqual(s.calls.at(-1).range,[0,24]);const next=[...s.w.document.querySelectorAll('#content button')].find(b=>b.textContent==='Suivant');assert.equal(next.disabled,false);next.click();await new Promise(r=>setImmediate(r));assert.deepEqual(s.calls.at(-1).range,[25,49])}finally{s.close()}});
test('empty orders and unavailable disputes have distinct honest states',async()=>{const s=await screen();try{await s.tab('orders');assert.match(s.w.document.querySelector('#content').textContent,/Aucun enregistrement/);await s.tab('disputes');assert.match(s.w.document.querySelector('#content').textContent,/litiges Stripe ne sont pas synchronisés/)}finally{s.close()}});
test('subscription selector loads courier subscriptions with a bounded projection',async()=>{const s=await screen();try{await s.tab('subscriptions');const select=s.w.document.querySelector('#content select');select.value='courierSubscriptions';select.dispatchEvent(new s.w.Event('change'));await new Promise(r=>setImmediate(r));assert.equal(s.calls.at(-1).table,'courier_subscriptions');assert.equal(s.calls.some(c=>c.columns?.includes('stripe_customer_id')),false)}finally{s.close()}});
test('read errors are shown rather than reported as zero records',async()=>{const s=await screen({fail:true});try{await s.tab('merchants');assert.match(s.w.document.querySelector('#content').textContent,/Lecture impossible : Service indisponible/);assert.doesNotMatch(s.w.document.querySelector('#content').textContent,/Aucun enregistrement/)}finally{s.close()}});
test('late responses cannot overwrite a new tab',async()=>{const s=await screen({delay:true});try{await s.tab('merchants');await s.tab('disputes');s.held.forEach(f=>f());await new Promise(r=>setImmediate(r));assert.equal(s.w.document.querySelector('#content h2').textContent,'Litiges');assert.equal(s.w.document.querySelector('#content table'),null)}finally{s.close()}});


test('merchant detail shows contact, business and subscription fields safely',async()=>{const s=await screen();try{await s.tab('merchants');[...s.w.document.querySelectorAll('#content button')].find(b=>b.textContent==='Voir la fiche').click();await new Promise(r=>setImmediate(r));const text=s.w.document.querySelector('.subscriber-detail').textContent;assert.match(text,/abonne@example.test/);assert.match(text,/12345678901234/);assert.match(text,/cus_test/);assert.match(text,/Non renseigné/);assert.doesNotMatch(text,/must-not-render/);assert.equal(s.calls.at(-1).args.p_kind,'merchant');assert.equal(s.calls.at(-1).args.p_id,'m1')}finally{s.close()}});
test('closing a detail ignores its pending response',async()=>{const s=await screen({detailDelay:true});try{await s.tab('merchants');[...s.w.document.querySelectorAll('#content button')].find(b=>b.textContent==='Voir la fiche').click();s.w.document.querySelector('.subscriber-detail button').click();s.held.forEach(f=>f());await new Promise(r=>setImmediate(r));assert.equal(s.w.document.querySelector('.subscriber-detail').hidden,true);assert.equal(s.w.document.querySelector('.subscriber-detail').textContent,'')}finally{s.close()}});


test('courier subscriber detail uses the courier ID',async()=>{const s=await screen();try{await s.tab('subscriptions');const select=s.w.document.querySelector('#content select');select.value='courierSubscriptions';select.dispatchEvent(new s.w.Event('change'));await new Promise(r=>setImmediate(r));[...s.w.document.querySelectorAll('#content button')].find(b=>b.textContent==='Voir la fiche').click();await new Promise(r=>setImmediate(r));assert.equal(s.calls.at(-1).args.p_kind,'courier');assert.equal(s.calls.at(-1).args.p_id,'c1');assert.match(s.w.document.querySelector('.subscriber-detail').textContent,/Livreur test/)}finally{s.close()}});
