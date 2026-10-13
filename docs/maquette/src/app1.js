const Z="__Z__";
const euro=c=>(c/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const rnd=n=>String(Math.floor(Math.random()*10**n)).padStart(n,'0');
const pad=n=>String(n).padStart(2,'0');
const mmss=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+pad(s%60)};
const DUE_MS=5*60*1000;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const IC={
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 menu:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 shop:'<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
 wallet:'<rect x="2" y="6" width="20" height="14" rx="3"/><path d="M2 10h20M16 15h2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 bike:'<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M5.5 17l4-8h5l4 8M9.5 9L8 6H6M14.5 9l1-3h2"/>'
};
const ic=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const stars=n=>'★'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n));
const luhn=s=>{s=s.replace(/\s/g,'');if(!/^\d{14}$/.test(s))return false;let sum=0;for(let i=0;i<14;i++){let d=+s[13-i];if(i%2){d*=2;if(d>9)d-=9}sum+=d}return sum%10===0};

function fresh(){return{
  view:'home',lines:[
    {key:'k|',id:'k',name:'Kebab galette',opts:[],price:850,q:1},
    {key:'f|',id:'f',name:'Frites maison',opts:[],price:300,q:1}],
  fulfil:'delivery',mealPay:'card',ridePay:'card',pick:null,
  order:null,sheet:null,avail:true,load:0,restoErr:'',courierErr:'',pickIn:'',dcodeIn:'',prep:15,tab:'client',
  r:{tab:'orders',sub:null,item:null,confirmDel:false,newOptName:'',newOptDelta:0,newCat:''},
  c:{tab:'runs',sub:null,saved:false},
  k:{tab:'home',sub:null,oi:null,newAddr:''},
  me:{name:'Nadia Benali',phone:'06 11 22 33 44',email:'nadia@exemple.fr',notif:{push:true,mail:true,sms:false},card:true,
    addrs:[{id:'a1',label:'Maison',line:'5 rue Saint-Augustin, 75002 Paris',def:true},{id:'a2',label:'Bureau',line:'18 rue de Richelieu, 75001 Paris',def:false}],favs:{samir:true,bella:false,petit:false}},
  stamps:7,
  corders:[{id:'o1',when:'Hier, 20:12',shop:'Chez Samir',items:['1 × Menu américain','1 × Boisson 33 cl'],total:1150,fee:350,mode:'delivery',pay:'carte',stars:5},
    {id:'o2',when:'Lun. 6 oct., 12:40',shop:'Bella Pizza',items:['1 × Pizza reine'],total:1200,fee:0,mode:'pickup',pay:'espèces',stars:4},
    {id:'o3',when:'Sam. 4 oct., 19:55',shop:'Chez Samir',items:['2 × Kebab galette'],total:1700,fee:350,mode:'delivery',pay:'carte',stars:0}],
  rated:false,rateC:0,rateR:0,rateTxt:'',
  shop:{open:true,published:true,name:'Chez Samir',payLink:'https://pay.sumup.com/b2c/chez-samir',legal:'Samir Food SAS',siret:'73282932000074',tva:'FR32732829320',addr:'12 rue de la Paix',cp:'75002',city:'Paris',phone:'01 42 00 00 00',email:'contact@chezsamir.fr',cat:'Sandwicherie',desc:'Kebabs et burgers maison, pain frais chaque matin.',
    deliveryOn:true,fee:350,radius:3000,cash:true,
    hours:['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d,i)=>({d,on:i<6,from:'11:30',to:i>=4?'23:00':'22:00'}))},
  menu:{cats:[{id:'s',name:'Sandwichs'},{id:'m',name:'Menus'},{id:'a',name:'Accompagnements'},{id:'b',name:'Boissons'},{id:'d',name:'Desserts'}],
    items:[
     {id:'k',cat:'s',name:'Kebab galette',desc:'Sauce blanche, oignons',price:850,avail:true,opts:[{name:'Fromage',delta:100},{name:'Double viande',delta:250},{name:'Sauce harissa',delta:0}]},
     {id:'m',cat:'m',name:'Menu américain',desc:'Burger, frites, boisson',price:950,avail:true,opts:[{name:'Boisson grande',delta:50}]},
     {id:'f',cat:'a',name:'Frites maison',desc:'Portion 300 g',price:300,avail:true,opts:[]},
     {id:'b',cat:'b',name:'Boisson 33 cl',desc:'Soda ou eau',price:200,avail:true,opts:[]},
     {id:'t',cat:'d',name:'Tiramisu',desc:'Fait maison',price:450,avail:false,opts:[]}]},
  links:{karim:'approved',lea:'approved',tom:'pending',bella:'none',petit:'none'},
  courier:{name:'Karim B.',phone:'06 12 34 56 78',legal:'Auto-entrepreneur',siret:'12345678900015',veh:'Scooter',zone:'Paris 1er à 4e',since:'mars 2026'},
  rating:{c:{sum:1043,count:212},r:{sum:1495,count:318}},
  doneToday:{rev:0,n:0,cash:0},runToday:{eur:0,n:0,cash:0},
  hist:[{t:'12:41',who:'Yasmine',mode:'Livraison',total:2150},{t:'12:15',who:'Karim D.',mode:'À emporter',total:1250},{t:'11:58',who:'Inès',mode:'Livraison',total:1900}],
  runs:[{when:'Hier 20:14',from:'Chez Samir',to:'Paris 1er',fee:350,pay:'carte',stars:5,txt:'Rapide et sympa'},{when:'Hier 19:02',from:'Chez Samir',to:'Paris 2e',fee:350,pay:'espèces',stars:5,txt:''},{when:'Hier 13:20',from:'Chez Samir',to:'Paris 3e',fee:400,pay:'carte',stars:4,txt:'Un peu de retard'},{when:'Lun. 21:07',from:'Chez Samir',to:'Paris 2e',fee:350,pay:'carte',stars:5,txt:''}],
  reviews:[{stars:5,txt:'Livraison ultra rapide, merci !',who:'Sarah'},{stars:5,txt:'Très aimable.',who:'Mehdi'},{stars:4,txt:'Un peu de retard mais prévenu à temps.',who:'Julie'}]
};}
let S=fresh();

const getP=p=>p.split('.').reduce((a,k)=>a==null?a:a[k],S);
const setP=(p,v)=>{const k=p.split('.');let o=S;for(let i=0;i<k.length-1;i++)o=o[k[i]];o[k[k.length-1]]=v};
const fee=()=>S.shop.fee;
const o=()=>S.order;
const mine=()=>o()&&o().courier==='Karim';
const linkedOk=()=>S.links.karim==='approved'&&S.avail||S.links.lea==='approved';
const canDeliver=()=>S.shop.deliveryOn&&linkedOk();
const missionVisible=()=>{const x=o();return x&&x.fulfil==='delivery'&&['accepted','ready'].includes(x.status)&&!x.courier&&!x.skipKarim&&S.avail&&S.load<2&&S.links.karim==='approved'};
const subtotal=()=>S.lines.reduce((s,l)=>s+l.price*l.q,0);
const avg=r=>r.sum/r.count;
const itemIdx=id=>S.menu.items.findIndex(i=>i.id===id);
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,3200)}

/* ---------- composants ---------- */
const field=(label,path,o={})=>{const v=getP(path);const val=o.type==='eur'?(v/100).toFixed(2).replace('.',','):v;
  return `<label class="fld"><span>${label}</span>${o.area?`<textarea data-path="${path}" maxlength="200">${esc(val)}</textarea>`:`<input data-path="${path}" data-type="${o.type||'text'}" value="${esc(val)}" ${o.type==='time'?'type="time"':''} ${o.mode?`inputmode="${o.mode}"`:''} ${o.ph?`placeholder="${o.ph}"`:''}>`}</label>`};
const sw=(path,on)=>`<button class="sw" role="switch" aria-checked="${on}" data-act="tog" data-path="${path}" aria-label="Activer"></button>`;
const chips=(path,vals,cur,fmt=x=>x)=>`<div class="chips">${vals.map(v=>`<button class="chip" aria-pressed="${cur===v}" data-act="set" data-path="${path}" data-v="${esc(v)}">${fmt(v)}</button>`).join('')}</div>`;
const row=(title,sub,act,extra='')=>`<button class="lr" data-act="${act}"><div class="f"><div class="sub">${title}</div>${sub?`<div class="mute">${sub}</div>`:''}</div>${extra}<span class="chev">›</span></button>`;
function barChart(vals,labels,fmt){const mx=Math.max(...vals)||1;return `<div class="bars">${vals.map((v,i)=>`<div class="${i===vals.length-1?'cur':''}"><em>${i===vals.length-1?fmt(v):''}</em><i style="height:${Math.max(4,Math.round(v/mx*80))}%"></i>${labels[i]}</div>`).join('')}</div>`}
function page(title,back,body,foot,tabbar){
  return `<div class="bar">${back?`<button class="back" data-act="${back===true?'back':back}" aria-label="Retour">‹</button>`:`<img src="${Z}" alt="ZeeRoo">`}<div class="t">${title}</div></div>
   <div class="body">${body}</div>${foot?`<div class="foot">${foot}</div>`:''}${tabbar||''}`;
}
const tabbar=(who,tabs,cur)=>`<div class="tabbar" role="tablist">${tabs.map(([k,l,i])=>`<button role="tab" aria-selected="${k===cur}" data-act="${who}tab" data-v="${k}">${ic(i)}${l}</button>`).join('')}</div>`;

/* ---------- Client ---------- */
function canOrder(){return S.shop.published&&S.shop.open}
function clientMain(){
  const x=o();
  if(S.view==='home'&&!x) return page('Autour de vous',null,`
    <p class="mute" style="margin:0">Paris 2e · 650 m</p>
    ${S.shop.published?`<button class="card" data-act="openMenu" style="text-align:left" ${canOrder()?'':'disabled'}>
      <div class="row"><div class="tile" style="background:var(--ink)">${esc(S.shop.name[0]||'?')}</div>
        <div class="f"><div class="sub">${esc(S.shop.name)}</div><div class="mute">${esc(S.shop.cat)} · ${canDeliver()?'Livraison '+euro(fee()):'Retrait seulement'}${S.shop.cash?' · Espèces au comptoir':''}</div>
        <div class="mute"><span class="stars">★</span> ${avg(S.rating.r).toFixed(1)} (${S.rating.r.count})</div></div></div>
      <div class="row">${canOrder()?'<span class="badge">Ouvert</span>':'<span class="badge w">Fermé pour le moment</span>'}${canDeliver()?'<span class="badge k">Livraison</span>':''}</div></button>`:''}
    <div class="card" style="opacity:.55"><div class="row"><div class="tile" style="background:var(--green-d)">P</div>
      <div class="f"><div class="sub">Le Petit Four</div><div class="mute">Boulangerie · Retrait seulement</div></div></div></div>
    <div class="card" style="opacity:.55"><div class="row"><div class="tile" style="background:var(--warn)">B</div>
      <div class="f"><div class="sub">Bella Pizza</div><div class="mute">Pizzeria · Livraison 4,00 €</div></div></div></div>
    <p class="mute" style="margin:0">Aucun frais de service : le prix de la carte, rien de plus.</p>`);
  if(S.view==='menu'&&!x){
    const body=S.menu.cats.map(c=>{const its=S.menu.items.filter(i=>i.cat===c.id);if(!its.length)return '';
      return `<div class="sec">${esc(c.name)}</div>`+its.map(m=>{const inCart=S.lines.filter(l=>l.id===m.id).reduce((s,l)=>s+l.q,0);
      return `<div class="card" ${m.avail?'':'style="opacity:.6"'}><div class="row"><div class="f"><div class="sub">${esc(m.name)}</div><div class="mute">${esc(m.desc)}</div>
        <div class="price">${euro(m.price)}${m.opts.length?' <span class="mute">· options</span>':''}</div></div>
        ${m.avail?`<div class="qty">${inCart?`<span class="mute">${inCart}</span>`:''}<button data-act="add" data-id="${m.id}" aria-label="Ajouter ${esc(m.name)}">+</button></div>`:'<span class="badge w">Épuisé</span>'}</div></div>`}).join('')}).join('');
    return page(S.shop.name,true,body,subtotal()?`<button class="btn" data-act="toCart">Voir le panier · ${euro(subtotal())}</button>`:'');
  }
  if(S.view==='cart'&&!x){
    const dl=S.fulfil==='delivery'&&canDeliver(), cashMeal=!dl&&S.mealPay==='cash'&&S.shop.cash;
    const total=subtotal();
    return page('Panier',true,`
      ${S.lines.map(l=>`<div class="row"><div class="f">${esc(l.name)}${l.opts.length?`<div class="mute">${esc(l.opts.join(', '))}</div>`:''}</div>
        <div class="qty"><button data-act="dec" data-key="${esc(l.key)}" aria-label="Retirer">−</button><span>${l.q}</span><button data-act="inc" data-key="${esc(l.key)}" aria-label="Ajouter">+</button></div><div class="price" style="min-width:64px;text-align:right">${euro(l.price*l.q)}</div></div>`).join('')}
      <div class="chips" role="group" aria-label="Mode">
        <button class="chip" aria-pressed="${!dl}" data-act="fulfil" data-v="pickup">À emporter</button>
        <button class="chip" aria-pressed="${dl}" data-act="fulfil" data-v="delivery" ${canDeliver()?'':'disabled style="opacity:.45"'}>🛵 Livraison</button></div>
      ${!canDeliver()?`<div class="note">Livraison indisponible : ${!S.shop.deliveryOn?'le restaurant ne livre pas pour le moment.':'aucun livreur disponible.'}</div>`:''}
      ${dl?`<div class="card"><div class="mute">Adresse de livraison</div><div>5 rue Saint-Augustin, 75002 Paris</div><div class="mute">650 m du restaurant · dans la zone (${S.shop.radius/1000} km)</div></div>
        <div class="card"><div class="sub">Paiement de la livraison (${euro(fee())})</div>
          <div class="chips"><button class="chip" aria-pressed="${S.ridePay==='card'}" data-act="ridePay" data-v="card">Carte, Apple Pay, Google Pay</button>
          <button class="chip" aria-pressed="${S.ridePay==='cash'}" data-act="ridePay" data-v="cash">Espèces au livreur</button></div>
          <div class="mute">${S.ridePay==='card'?'Vous paierez le livreur via son lien de paiement dès qu\'il prend la livraison.':'Prévoyez l\'appoint : vous remettez la somme au livreur en main propre.'}</div></div>`
      :(S.shop.cash?`<div class="card"><div class="sub">Paiement de la commande</div>
          <div class="chips"><button class="chip" aria-pressed="${S.mealPay==='card'}" data-act="mealPay" data-v="card">Carte, Apple Pay, Google Pay</button>
          <button class="chip" aria-pressed="${S.mealPay==='cash'}" data-act="mealPay" data-v="cash">Espèces au comptoir</button></div></div>`:'')}
      <div class="row"><div class="f">Repas</div><div class="price">${euro(total)}</div></div>
      ${dl?`<div class="row"><div class="f">Frais de livraison (payés au livreur)</div><div class="price">${euro(fee())}</div></div>`:''}
      <div class="row"><div class="f"><b>Total</b></div><div class="price">${euro(total+(dl?fee():0))}</div></div>
      <p class="mute" style="margin:0">${cashMeal?'Vous payez en espèces en récupérant la commande.':'Rien n\'est payé maintenant. Dès que le restaurant accepte, vous le payez directement par carte, Apple Pay ou Google Pay, via son lien de paiement.'+(dl?' La livraison se paie de la même façon au livreur.':'')}</p>`,
      `<button class="btn" data-act="order" ${S.lines.length?'':'disabled'}>${cashMeal?'Commander (paiement au comptoir)':'Commander · '+euro(total+(dl?fee():0))}</button>`);
  }
  return track();
}
function track(){
  const x=o(), d=x.fulfil==='delivery';
  const steps=d?[['placed','Envoyée'],['accepted','Acceptée'],['ready','Prête'],['out','En route'],['delivered','Livrée']]:[['placed','Envoyée'],['accepted','Acceptée'],['ready','Prête'],['delivered','Récupérée']];
  const order=['placed','accepted','ready','out','delivered'];
  const idx=order.indexOf(x.status);
  const title={placed:'En attente du restaurant…',accepted:d&&!x.courier?'Acceptée. Un livreur va la prendre.':'Acceptée, en préparation',ready:d?'Commande prête':'C\'est prête !',out:'Votre livreur arrive',delivered:d?'Livrée. Bon appétit !':'Commande récupérée'}[x.status];
  let ride='';
  if(d&&['accepted','ready','out'].includes(x.status)){
    if(!x.courier) ride=`<div class="note">🔎 Recherche d'un livreur…</div>`;
    else if(x.ridePay==='card'&&!x.ridePaid) ride=payCard('ride','Payer votre livreur '+x.courier,x.fee,x.rideDeclared,x.courier,'PayPal');
    else if(x.ridePay==='card') ride=`<div class="note ok">✅ ${x.courier} a reçu votre paiement de ${euro(x.fee)} pour la livraison.</div>`;
    else ride=`<div class="note ok">🛵 ${x.courier} livre votre commande. Prévoyez ${euro(x.fee)} en espèces.</div>`;
  }
  const mealBox=x.mealPay!=='card'?'':x.status==='placed'?`<div class="note">Vous paierez ${esc(S.shop.name)} par carte dès qu'il aura accepté votre commande.</div>`
    :x.mealPaid?`<div class="note ok">✅ ${esc(S.shop.name)} a reçu votre paiement de ${euro(x.total)}.</div>`
    :payCard('meal','Payer '+S.shop.name,x.total,x.mealDeclared,S.shop.name,'SumUp');
  const codeCard=x.status==='out'?`<div class="card"><div class="mute" style="text-align:center">Code de livraison à donner au livreur</div><div class="code">${x.dcode}</div></div>`
    :(!d&&['accepted','ready'].includes(x.status)?`<div class="card"><div class="mute" style="text-align:center">Code de retrait au comptoir</div><div class="code">${x.code}</div></div>`:'');
  const rate=x.status==='delivered'?(S.rated?`<div class="note ok">Merci pour votre avis !</div>`:`<div class="card"><div class="sub">Comment c'était ?</div>
     ${d&&x.courier==='Karim'?`<div class="mute">${esc(x.courier)}, votre livreur</div><div>${[1,2,3,4,5].map(n=>`<button class="starbtn ${S.rateC>=n?'on':''}" data-act="rateC" data-v="${n}" aria-label="${n} étoiles livreur">★</button>`).join('')}</div>`:''}
     <div class="mute">${esc(S.shop.name)}</div><div>${[1,2,3,4,5].map(n=>`<button class="starbtn ${S.rateR>=n?'on':''}" data-act="rateR" data-v="${n}" aria-label="${n} étoiles restaurant">★</button>`).join('')}</div>
     <input class="in" data-path="rateTxt" placeholder="Un commentaire (facultatif)" value="${esc(S.rateTxt)}">
     <button class="btn" data-act="sendRate" ${S.rateR||S.rateC?'':'disabled'}>Envoyer mon avis</button></div>`):'';
  return page('Ma commande',null,`
    <div class="h">${title}</div>
    <div class="timeline">${steps.map(([k,l])=>`<div class="${order.indexOf(k)<=idx?'done':''}">${l}</div>`).join('')}</div>
    ${x.skipNote?`<div class="note bad">${x.skipNote}</div>`:''}
    ${mealBox}${ride}${codeCard}${rate}
    <div class="card"><div class="sub">${esc(S.shop.name)}</div>${x.items.map(l=>`<div class="row"><div class="f">${l.q} × ${esc(l.name)}</div><div class="price">${euro(l.price*l.q)}</div></div>`).join('')}
      <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
      <div class="row"><div class="f">Repas</div><div class="price">${euro(x.total)}</div></div>
      ${d?`<div class="row"><div class="f">Frais de livraison</div><div class="price">${euro(x.fee)}</div></div>`:''}
      <div class="row"><div class="f"><b>Total</b></div><div class="price">${euro(x.total+(d?x.fee:0))}</div></div>
      <div class="mute">${x.mealPay==='cash'?`Repas : ${euro(x.total)} en espèces au comptoir.`:(x.mealPaid?`Repas : ${euro(x.total)} payés par carte au restaurant.`:`Repas : ${euro(x.total)} à payer au restaurant (carte).`)}</div>
      ${d?`<div class="mute">${x.ridePay==='cash'?`Livraison : ${euro(x.fee)} en espèces au livreur.`:(x.ridePaid?`Livraison : ${euro(x.fee)} payés par carte au livreur.`:`Livraison : ${euro(x.fee)} à payer au livreur (carte).`)}</div>`:''}
      <div class="mute">Paiements directs aux professionnels : ZeeRoo n'encaisse rien.</div></div>`,
    x.status==='delivered'?`<button class="btn dark" data-act="newOrder">Nouvelle commande</button>`:'');
}
// Paiement direct : le client ouvre la page de paiement du professionnel (son lien SumUp, PayPal…).
function payCard(kind,title,amount,declared,who,provider){
  return `<div class="card" style="border-color:var(--green)"><div class="row"><div class="sub f">${esc(title)}</div><div class="price">${euro(amount)}</div></div>
    ${declared?`<div class="note">Vous avez payé. ${esc(who)} confirme la réception.</div>`
      :`<div class="mute">Carte, Apple Pay ou Google Pay, sur la page de paiement de ${esc(who)} (${provider}). L'argent va directement sur son compte.</div>
      <button class="btn" data-act="${kind==='meal'?'payMeal':'payRide'}">Payer ${euro(amount)}</button>`}</div>`;
}
function sheet(){
  if(S.pick){const it=S.menu.items[itemIdx(S.pick.id)];const sel=S.pick.sel;
    const price=it.price+it.opts.filter(p=>sel.includes(p.name)).reduce((s,p)=>s+p.delta,0);
    return `<div class="sheet"><div><div class="sub">${esc(it.name)}</div><div class="mute">Choisissez vos options</div>
      ${it.opts.map(p=>`<button class="lr" data-act="pickOpt" data-v="${esc(p.name)}"><div class="f">${esc(p.name)}</div><span class="price">${p.delta?'+'+euro(p.delta):'Offert'}</span><span class="sw" style="pointer-events:none" role="switch" aria-checked="${sel.includes(p.name)}"></span></button>`).join('')}
      <button class="btn" data-act="pickAdd">Ajouter · ${euro(price)}</button><button class="btn ghost" data-act="pickCancel">Annuler</button></div></div>`}
  const s=S.sheet; if(!s) return '';
  return `<div class="sheet"><div><div class="mute">${s.provider} · page de paiement de ${esc(s.who)}</div><div class="row"><div class="f sub">${esc(s.who)}</div><div class="price">${euro(s.amount)}</div></div>
    <button class="btn dark" data-act="sheetPay">Apple Pay</button><button class="btn ghost" data-act="sheetPay">Google Pay</button><button class="btn ghost" data-act="sheetPay">Carte •••• 4242</button>
    <button class="btn ghost" data-act="sheetCancel">Annuler</button></div></div>`;
}
