/* ---------- Livreur ---------- */
const CTABS=[['runs','Courses','bike'],['rest','Restaurants','shop'],['earn','Revenus','wallet'],['me','Compte','user']];
const CDAYS=[4200,5250,3850,6300,7700,9100,2450];
function livreur(){
  const c=S.c, tb=tabbar('c',CTABS,c.tab);
  if(c.sub==='edit') return courierEdit();
  if(c.tab==='earn') return courierEarn(tb);
  if(c.tab==='rest') return courierRest(tb);
  if(c.tab==='me') return courierMe(tb);
  return courierRuns(tb);
}
function courierRuns(tb){
  const x=o(), m=mine()&&x.status!=='delivered'?x:null;
  const load=S.load+(m?1:0);
  const linked=S.links.karim==='approved';
  let body=`<div class="card"><div class="row"><div class="f"><div class="sub">Je suis disponible</div><div class="mute">Charge : ${load} / ${cap()} livraison${cap()>1?'s':''} · formule Livreur ${S.cplan==='pro'?'Pro':'Start'}</div></div>
    <button class="chip" aria-pressed="${S.avail}" data-act="avail">${S.avail?'Oui':'Non'}</button></div></div>`;
  if(!linked) body+=`<div class="note bad">Chez Samir ne vous a pas (ou plus) rattaché. Demandez à livrer depuis l'onglet Restaurants.</div>`;
  if(S.cplan!=='pro') body+=`<div class="note">Formule Livreur Start : une course à la fois, hors livraisons de nuit (22 h – 6 h). Passez en Pro dans l'onglet Compte.</div>`;
  if(m){
    const d=m,cash=d.ridePay==='cash',F=d.fee;
    const awaiting=!cash&&!d.ridePaid;
    body+=`<div class="card" style="border-color:var(--green)">
      <div class="row"><div class="f"><div class="sub">Retrait : ${esc(S.shop.name)}</div><div class="mute">${esc(S.shop.addr)}, ${esc(S.shop.city)} · puis 5 rue Saint-Augustin (650 m)</div></div><span class="badge">${euro(F)}</span></div>
      ${awaiting?`<div class="note">${d.rideDeclared?'Le client indique avoir payé '+euro(F)+' via votre lien : vérifiez la réception.':'Le client doit vous payer '+euro(F)+' via votre lien de paiement (PayPal).'}</div><button class="btn sm" data-act="confirmRide">Paiement reçu</button>`:''}
      ${!awaiting&&!cash&&d.status!=='out'?`<div class="note ok">Livraison payée par carte.</div>`:''}
      ${cash&&d.status!=='out'?`<div class="note">À encaisser en espèces à la livraison : ${euro(F)}.</div>`:''}
      ${['accepted','ready'].includes(d.status)?`<div class="mute" style="text-align:center">Code de retrait à montrer au restaurant</div><div class="code">${d.code}</div>
        <div class="mute">${d.status==='ready'?'Commande prête : rendez-vous au restaurant.':'Le restaurant prépare la commande (prête dans '+d.prep+' min).'}</div>`:''}
      ${d.status==='out'?`${cash?`<div class="note">Encaissez ${euro(F)} en espèces, puis validez avec le code.</div>`:''}<div class="mute">En route vers 5 rue Saint-Augustin. Digicode 1234.</div>
        <input class="t" data-path="dcodeIn" inputmode="numeric" maxlength="4" placeholder="Code client" value="${S.dcodeIn}" aria-label="Code de livraison">
        <button class="btn" data-act="deliver">Valider la livraison</button>`:''}
      ${['accepted','ready'].includes(d.status)&&!d.ridePaid?`<button class="btn ghost" data-act="release">Abandonner la mission</button>`:''}
      ${S.courierErr?`<div class="note bad">${S.courierErr}</div>`:''}</div>`;
  }
  if(x&&x.status==='delivered'&&x.courier==='Karim') body+=`<div class="note ok">Livraison terminée${x.ridePay==='cash'?' · espèces encaissées':''}. +${euro(x.fee)}</div>`;
  if(x&&x.skipKarim&&!x.courier) body+=`<div class="note">Cette mission ne vous sera plus proposée.</div>`;
  if(x&&x.courier==='Léa') body+=`<div class="note bad">Mission prise par un autre livreur.</div>`;
  if(missionVisible()) body+=`<div class="sub">Missions disponibles</div><div class="mute" style="margin-top:-8px">Le premier qui accepte obtient la course. ${S.cplan==='pro'?'Vous pouvez en avoir 2 en même temps.':'Une course à la fois en formule Start.'}</div>
    <div class="card"><div class="row"><div class="f"><div class="sub">${esc(S.shop.name)} → Paris 2e</div><div class="mute">650 m · ${x.status==='ready'?'Prête':'Prête dans '+x.prep+' min'} · ${x.ridePay==='cash'?'espèces':'carte'}${x.when?' · programmée '+x.when:''}</div></div><span class="badge">${euro(x.fee)}</span></div>
      <button class="btn" data-act="accept2">Accepter la mission</button>${S.courierErr?`<div class="note bad">${S.courierErr}</div>`:''}</div>`;
  else if(!m&&!(x&&x.courier==='Léa')&&S.avail&&S.load>=cap()) body+=`<div class="note">Vous avez déjà ${cap()} livraison${cap()>1?'s':''} en cours : aucune mission proposée.</div>`;
  else if(!m&&!x&&linked) body+=`<div class="empty"><div class="h">Aucune mission</div><p>Restez disponible : les missions apparaissent quand un restaurant accepte une commande à livrer.</p></div>`;
  return page('Mes courses',null,body,'',tb);
}
function courierEarn(tb){
  const days=CDAYS.map((v,i)=>i===6?v+S.runToday.eur:v);
  const w=days.reduce((a,b)=>a+b,0), n=[8,9,7,11,13,15,3].reduce((a,b)=>a+b,0)+S.runToday.n;
  const cashShare=Math.round((0.3*(w-S.runToday.eur)+S.runToday.cash)/w*100);
  return page('Revenus',null,`
   <div class="grid2"><div class="stat"><b>${euro(days[6])}</b><span>Aujourd'hui · ${3+S.runToday.n} courses</span></div><div class="stat"><b>${euro(w)}</b><span>7 derniers jours · ${n} courses</span></div></div>
   <div class="card"><div class="sub">Gains par jour</div>${barChart(days,DAYS,v=>euro(v))}</div>
   <div class="card"><div class="sub">Répartition</div>
     <div class="dist"><span style="width:92px;color:var(--ink)">Carte</span><span class="tr"><i style="width:${100-cashShare}%"></i></span><span>${100-cashShare} %</span></div>
     <div class="dist"><span style="width:92px;color:var(--ink)">Espèces</span><span class="tr"><i style="width:${cashShare}%"></i></span><span>${cashShare} %</span></div>
     <div class="mute">Les paiements par carte arrivent par votre lien de paiement, sur votre compte bancaire. Les espèces sont déjà dans votre poche.</div></div>
   <div class="note ok"><b>0 % de commission.</b> Chaque livraison vous est payée en totalité par le client.</div>
   <div class="card"><div class="row"><div class="f"><div class="sub">Lien de paiement</div><div class="mute">paypal.me/karim · les clients vous paient directement</div></div><span class="badge">Actif</span></div></div>
   ${courierHist()}`,'',tb);
}
function courierHist(){
  const all=[...(S.runsToday||[]),...S.runs];
  return `<div class="sec">Historique · ${all.length} courses récentes</div>`+all.map(r=>`<div class="card"><div class="row"><div class="f"><div class="sub">${esc(r.from)} → ${esc(r.to)}</div><div class="mute">${esc(r.when)} · ${r.pay}</div></div><div class="price">${euro(r.fee)}</div></div>
    <div class="row"><span class="stars">${r.stars?stars(r.stars):'<span class="mute">Pas encore noté</span>'}</span></div>${r.txt?`<div class="mute">« ${esc(r.txt)} »</div>`:''}</div>`).join('');
}
function courierMe(tb){
  const c=S.courier, rt=avg(S.rating.c);
  const dist=[5,4,3,2,1].map(k=>({k,p:k===5?88:k===4?9:k===3?2:k===2?1:0}));
  const L=k=>S.links[k];
  const linkRow=(k,name,city)=>`<div class="lr"><div class="f"><div class="sub">${name}</div><div class="mute">${city}</div></div>${L(k)==='approved'?'<span class="badge">Rattaché</span>':L(k)==='pending'?'<span class="badge w">En attente</span>':L(k)==='rejected'?'<span class="badge w">Refusé</span>':`<button class="btn sm" data-act="reqLink" data-k="${k}">Demander</button>`}</div>`;
  return page('Profil',null,`
   <div class="card"><div class="row"><div class="av">${esc(c.name[0])}</div><div class="f"><div class="h">${esc(c.name)}</div><div class="mute">${esc(c.veh)} · ${esc(c.zone)} · livreur depuis ${c.since}</div>
     <div><span class="stars">${stars(rt)}</span> <b>${rt.toFixed(2)}</b> <span class="mute">(${S.rating.c.count} avis)</span></div></div></div>
     <div class="grid2"><div class="stat"><b>96 %</b><span>Missions acceptées</span></div><div class="stat"><b>1 %</b><span>Annulations</span></div></div></div>
   <div class="card"><div class="sub">Mes notes</div>${dist.map(d=>`<div class="dist"><span style="width:28px">${d.k} ★</span><span class="tr"><i style="width:${d.p}%"></i></span><span style="width:32px;text-align:right">${d.p} %</span></div>`).join('')}</div>
   <div class="card"><div class="row"><div class="sub f">Entreprise</div><button class="btn sm ghost" data-act="csub:edit">Modifier</button></div>
     <div class="row"><div class="f mute">Statut</div><div>${esc(c.legal)}</div></div><div class="row"><div class="f mute">SIRET</div><div>${esc(c.siret)} <span class="${luhn(c.siret)?'ok':'danger'}">${luhn(c.siret)?'✓':'✗'}</span></div></div>
     <div class="row"><div class="f mute">Téléphone</div><div>${esc(c.phone)}</div></div><div class="row"><div class="f mute">Véhicule</div><div>${esc(c.veh)}</div></div></div>
   <div class="card"><div class="sub">Documents</div>
     <div class="row"><div class="f">Pièce d'identité</div><span class="badge">Vérifiée</span></div>
     <div class="row"><div class="f">Avis de situation INSEE</div><span class="badge">Vérifié</span></div>
     <div class="row"><div class="f">Assurance responsabilité civile</div><span class="badge w">À renouveler</span></div>
     <button class="btn sm ghost" data-act="toastDocs">Mettre à jour un document</button></div>
   <div class="card"><div class="row"><div class="f"><div class="sub">Abonnement Livreur ${S.cplan==='pro'?'Pro':'Start'}</div><div class="mute">${S.cplan==='pro'?'24,99 € HT / mois (29,99 € TTC) · ou 249,99 € HT par an. Jusqu\'à 2 courses simultanées et livraisons de nuit (22 h – 6 h).':'14,99 € HT / mois (17,99 € TTC) · ou 149,99 € HT par an. Une course à la fois, hors livraisons de nuit.'}</div></div><span class="badge">Essai</span></div>
     <div class="chips"><button class="chip" aria-pressed="${S.cplan==='start'}" data-act="cplan" data-v="start">Start</button><button class="chip" aria-pressed="${S.cplan==='pro'}" data-act="cplan" data-v="pro">Pro</button></div>
     <div class="mute">Le changement de formule modifie votre abonnement existant, au prorata.</div></div>
   <div class="card"><div class="sub">Avis récents</div>${S.reviews.map(r=>`<div><span class="stars">${stars(r.stars)}</span> <span class="mute">${esc(r.who)}</span><div>${esc(r.txt)}</div></div>`).join('')}</div>`,'',tb);
}
function courierRest(tb){
  const L=k=>S.links[k];
  const linkRow=(k,name,city)=>`<div class="lr"><div class="f"><div class="sub">${name}</div><div class="mute">${city}</div></div>${L(k)==='approved'?'<span class="badge">Rattaché</span>':L(k)==='pending'?'<span class="badge w">En attente</span>':L(k)==='rejected'?'<span class="badge w">Refusé</span>':`<button class="btn sm" data-act="reqLink" data-k="${k}">Demander</button>`}</div>`;
  return page('Restaurants',null,`<div class="mute">Vous recevez les missions des restaurants qui vous ont accepté. Chaque restaurant décide d'accepter ou non votre demande.</div>
   <div class="card" style="padding:4px 12px">${linkRow('karim',esc(S.shop.name),'Paris 2e · livraison '+euro(fee()))}${linkRow('bella','Bella Pizza','Paris 9e · livraison 4,00 €')}${linkRow('petit','Le Petit Four','Paris 1er · retrait seulement')}</div>`,'',tb);
}
function courierEdit(){
  const c=S.courier;
  return page('Mon profil','cback',`
   ${field('Nom affiché','courier.name')}${field('Téléphone','courier.phone',{mode:'tel'})}
   <div class="mute">Statut juridique</div>${chips('courier.legal',['Auto-entrepreneur','Société'],c.legal)}
   ${field('SIRET','courier.siret',{mode:'numeric'})}<div class="mute ${luhn(c.siret)?'ok':'danger'}">${luhn(c.siret)?'SIRET valide ✓':'SIRET invalide : 14 chiffres, clé de contrôle fausse.'}</div>
   <div class="mute">Véhicule</div>${chips('courier.veh',['Vélo','Scooter','Voiture','À pied'],c.veh)}
   ${field('Zone de travail','courier.zone')}`,'<button class="btn" data-act="cback">Enregistrer</button>');
}

/* ---------- squelette et rendu ---------- */
function render(){
  const keep=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.path;
  $('p-client').innerHTML=client()+sheet();
  $('p-resto').innerHTML=resto();
  $('p-livreur').innerHTML=livreur();
  devbar();hints();tabsUI();
  if(keep){const e=document.querySelector(`[data-path="${keep}"]`);if(e){e.focus();try{e.setSelectionRange(e.value.length,e.value.length)}catch(_){}}}
}
function renderExcept(id){
  if(id!=='p-client')$('p-client').innerHTML=client()+sheet();
  if(id!=='p-resto')$('p-resto').innerHTML=resto();
  if(id!=='p-livreur')$('p-livreur').innerHTML=livreur();
  hints();
}
function devbar(){$('dev').innerHTML=`<span class="lbl">Simuler :</span><button data-act="rival">Léa accepte avant vous</button><button data-act="load">Livraisons déjà en cours : ${S.load}</button>`}
function tabsUI(){
  document.querySelectorAll('[data-col]').forEach(c=>c.classList.toggle('show',c.dataset.col===S.tab));
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===S.tab));
}
function hints(){
  const x=o();let i=0,t;
  if(!x){i=0;t='Client : trouvez Chez Samir dans l\'annuaire (À proximité) et commandez, en livraison ou à emporter. Côté restaurant, coupez le Happy Hour ou modifiez le menu : le client le voit aussitôt.'}
  else if(x.status==='placed'){i=1;t='Restaurant : acceptez la commande : le client peut alors vous payer (lien de paiement ou espèces).'}
  else if(x.status==='refused'){i=1;t='Commande refusée : le client n\'a rien payé. Recommencez la démo.'}
  else if(x.status==='accepted'&&x.fulfil==='delivery'&&!x.courier){i=2;t=x.skipKarim?'La mission est revenue dans le pool. Cliquez « Recommencer » pour rejouer, ou faites accepter Léa.':'Livreur : la mission apparaît chez tous les livreurs. Acceptez-la, le premier gagne.'}
  else if(x.status==='accepted'&&x.mealPay==='card'&&!x.mealDeclared&&!x.mealPaid){i=3;t='Client : payez le restaurant via son lien de paiement (carte, Apple Pay, Google Pay).'}
  else if(x.courier&&x.ridePay==='card'&&!x.rideDeclared&&!x.ridePaid&&x.status!=='delivered'){i=3;t='Client : payez votre livreur via son lien de paiement.'}
  else if(x.mealDeclared&&!x.mealPaid){i=3;t='Restaurant : vérifiez la réception puis appuyez sur « Paiement reçu ».'}
  else if(x.rideDeclared&&!x.ridePaid&&x.status!=='delivered'){i=3;t='Livreur : vérifiez la réception puis appuyez sur « Paiement reçu ».'}
  else if(x.status==='accepted'){i=4;t='Restaurant : marquez la commande prête.'}
  else if(x.status==='ready'){i=4;t=x.fulfil==='delivery'?'Restaurant : entrez le code de retrait du livreur et remettez la commande.':'Restaurant : entrez le code du client pour remettre la commande.'}
  else if(x.status==='out'){i=5;t='Livreur : demandez au client son code de livraison et validez.'}
  else {i=5;t='Terminé. Notez la livraison côté client : la note de Karim se met à jour dans son profil. Puis regardez Activité et Revenus.'}
  $('hint').textContent=t;
  $('steps').innerHTML=['Commande','Acceptation','Mission','Paiements','Préparation','Livraison'].map((s,k)=>`<i class="${k===i?'on':''}">${s}</i>`).join('');
}

/* ---------- actions ---------- */
function newOrder(){
  const d=S.fulfil==='delivery'&&canDeliver();
  S.order={fulfil:d?'delivery':'pickup',mealPay:d?'card':(S.shop.cash?S.mealPay:'card'),ridePay:S.ridePay,fee:fee(),
    items:S.lines.map(l=>({name:l.name+(l.opts.length?' ('+l.opts.join(', ')+')':''),price:linePrice(l),q:l.q})),total:subtotal(),when:S.sched==='later'?S.slot:null,
    status:'placed',code:rnd(4),dcode:rnd(4),prep:S.prep,courier:null,ridePaid:false,rideDeclared:false,mealPaid:false,mealDeclared:false,due:null,skipKarim:false,counted:false};
  S.rated=false;S.rateC=0;S.rateR=0;S.rateTxt='';S.view='home';S.sheet=null;
}
function releaseMission(note,msg){const x=o();x.courier=null;x.due=null;x.rideDeclared=false;x.skipKarim=true;x.skipNote=note;S.courierErr='';if(msg)toast(msg)}
function finish(){ // commande terminée : alimente l'activité du restaurant et les revenus du livreur
  const x=o();if(x.counted)return;x.counted=true;
  const d=x.fulfil==='delivery';
  S.stamps=Math.min(9,S.stamps+1);
  S.corders.unshift({id:'n'+rnd(4),when:'À l\'instant',shop:S.shop.name,items:x.items.map(l=>l.q+' × '+l.name),total:x.total,fee:d?x.fee:0,mode:x.fulfil,pay:(d?x.ridePay:x.mealPay)==='cash'?'espèces':'carte',stars:0});
  S.doneToday.rev+=x.total;S.doneToday.n+=1;
  S.hist.unshift({t:new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),who:'Nadia',mode:d?'Livraison':'À emporter',total:x.total});
  if(d&&x.courier==='Karim'){S.runToday.eur+=x.fee;S.runToday.n+=1;if(x.ridePay==='cash')S.runToday.cash+=x.fee;
    S.runsToday=S.runsToday||[];S.runsToday.unshift({when:'Aujourd\'hui',from:S.shop.name,to:'Paris 2e',fee:x.fee,pay:x.ridePay==='cash'?'espèces':'carte',stars:0,txt:''})}
}
const A={
  openMenu(){S.view='menu'},
  back(){S.view=S.view==='cart'?'menu':'home'},
  add(e){const it=S.menu.items[itemIdx(e.dataset.id)];if(!it||!it.avail)return;if(it.opts.length)S.pick={id:it.id,sel:[]};else addLine(it,[])},
  pickOpt(e){const v=e.dataset.v,s=S.pick.sel;const i=s.indexOf(v);i<0?s.push(v):s.splice(i,1)},
  pickAdd(){const it=S.menu.items[itemIdx(S.pick.id)];addLine(it,S.pick.sel);S.pick=null},
  pickCancel(){S.pick=null},
  inc(e){const l=S.lines.find(l=>l.key===e.dataset.key);if(l)l.q++},
  dec(e){const l=S.lines.find(l=>l.key===e.dataset.key);if(l){l.q--;if(l.q<=0)S.lines=S.lines.filter(x=>x!==l)}},
  toCart(){S.view='cart'},
  fulfil(e){S.fulfil=e.dataset.v},ridePay(e){S.ridePay=e.dataset.v},mealPay(e){S.mealPay=e.dataset.v},
  order(){
    const dl=S.fulfil==='delivery'&&canDeliver(),cash=!dl&&S.mealPay==='cash'&&S.shop.cash;
    newOrder();toast(cash?'Commande envoyée, paiement au comptoir.':'Commande envoyée. Vous paierez le restaurant dès qu\'il accepte.');
  },
  sheetPay(){const x=o();if(S.sheet.kind==='meal')x.mealDeclared=true;else x.rideDeclared=true;const who=S.sheet.who;S.sheet=null;toast('Paiement envoyé à '+who+'. Il confirme la réception.')},
  sheetCancel(){S.sheet=null;toast('Paiement annulé.')},
  payMeal(){const x=o();if(!x||x.mealPaid)return;S.sheet={kind:'meal',who:S.shop.name,provider:'SumUp',amount:x.total}},
  payRide(){const x=o();if(!x.courier||x.ridePaid)return;S.sheet={kind:'ride',who:x.courier,provider:'PayPal',amount:x.fee}},
  confirmMeal(){o().mealPaid=true;toast('Paiement du repas confirmé.')},
  confirmRide(){o().ridePaid=true;toast('Paiement de la livraison confirmé.')},
  newOrder(){S.order=null;S.lines=[{key:'k|',id:'k',name:'Kebab galette',opts:[],price:850,q:1}];S.view='home'},
  rateC(e){S.rateC=+e.dataset.v},rateR(e){S.rateR=+e.dataset.v},
  sendRate(){
    if(S.rateR){S.rating.r.sum+=S.rateR;S.rating.r.count++}
    if(S.rateC&&o().courier==='Karim'){S.rating.c.sum+=S.rateC;S.rating.c.count++;
      if(S.runsToday&&S.runsToday[0]){S.runsToday[0].stars=S.rateC;S.runsToday[0].txt=S.rateTxt}
      S.reviews.unshift({stars:S.rateC,txt:S.rateTxt||'(sans commentaire)',who:'Nadia'})}
    S.rated=true;toast('Merci ! Les notes sont mises à jour.');
  },
  prep(e){S.prep=+e.dataset.v},
  accept(){const x=o();x.status='accepted';x.prep=S.prep;S.restoErr='';toast(x.mealPay==='cash'?'Commande acceptée.':'Commande acceptée : le client peut vous payer.')},
  refuse(){o().status='refused';toast('Commande refusée : le client n\'a rien payé.')},
  ready(){o().status='ready'},
  collect(){const x=o();if(S.pickIn!==x.code){S.restoErr='Code de retrait incorrect.';return}x.status='delivered';S.restoErr='';S.pickIn='';finish()},
  handover(){const x=o();S.restoErr='';
    if(!x.courier){S.restoErr='Aucun livreur n\'a pris la livraison.';return}
    if(S.pickIn!==x.code){S.restoErr='Code de retrait incorrect.';return}
    x.status='out';S.pickIn=''},
  avail(){S.avail=!S.avail},
  accept2(){const x=o();if(S.load>=cap()){S.courierErr='Vous avez déjà '+cap()+' livraison'+(cap()>1?'s':'')+' en cours.';return}
    x.courier='Karim';x.skipNote='';S.courierErr='';
    toast(x.ridePay==='card'?'Mission acceptée : le client vous paie via votre lien.':'Mission acceptée : livraison en espèces.')},
  release(){releaseMission('Votre livreur a abandonné la mission. Elle est reproposée à d\'autres livreurs.','Mission abandonnée.')},
  deliver(){const x=o();if(S.dcodeIn!==x.dcode){S.courierErr='Code de livraison incorrect.';return}
    x.status='delivered';S.dcodeIn='';S.courierErr='';finish();toast(x.ridePay==='cash'?'Livré. Espèces encaissées.':'Livraison validée.')},
  rival(){const x=o();if(!x||!missionVisible()){toast('Aucune mission à prendre pour le moment.');return}
    x.courier='Léa';toast('Léa a accepté la mission avant vous.')},
  load(){S.load=(S.load+1)%(cap()+1)},
  fast(){const x=o();if(x&&x.courier&&x.ridePay==='card'&&!x.ridePaid)x.due=Date.now()-1;else toast('Acceptez une mission avec une livraison par carte d\'abord.')},
  /* tableau de bord client */
  ktab(e){S.k.tab=e.dataset.v;S.k.sub=null},kback(){S.k.sub=null},
  kopen(e){S.k.oi=e.dataset.id;S.k.sub='order'},
  reorder(){const c=S.corders.find(c=>c.id===S.k.oi);if(!c)return;
    S.lines=[];c.items.forEach(t=>{const m=t.match(/^(\d+) × (.*)$/);const it=S.menu.items.find(i=>i.name===m[2]);if(it&&it.avail)S.lines.push({key:it.id+'|',id:it.id,name:it.name,opts:[],price:it.price,q:+m[1]})});
    if(!S.lines.length){toast('Ces produits ne sont plus disponibles.');return}
    if(o()&&['delivered','refused'].includes(o().status))S.order=null;S.k.tab='home';S.k.sub=null;S.view='cart';toast('Commande reprise dans le panier.')},
  addAddr(){const n=S.k.newAddr.trim();if(!n){toast('Saisissez une adresse.');return}S.me.addrs.push({id:'a'+rnd(4),label:'Autre',line:n,def:false});S.k.newAddr=''},
  defAddr(e){S.me.addrs.forEach(a=>a.def=a.id===e.dataset.id)},
  delAddr(e){if(S.me.addrs.length<2){toast('Gardez au moins une adresse.');return}const was=S.me.addrs.find(a=>a.id===e.dataset.id).def;S.me.addrs=S.me.addrs.filter(a=>a.id!==e.dataset.id);if(was)S.me.addrs[0].def=true},
  fav(e){S.me.favs[e.dataset.k]=!S.me.favs[e.dataset.k]},
  delCard(){S.me.card=!S.me.card;toast(S.me.card?'Carte ajoutée.':'Carte supprimée.')},
  toastK(){toast('Dans l\'app, ceci ouvre la page correspondante.')},
  /* tableaux de bord */
  rtab(e){S.r.tab=e.dataset.v;S.r.sub=null},ctab(e){S.c.tab=e.dataset.v;S.c.sub=null},
  rback(){S.r.sub=null;S.r.confirmDel=false},cback(){S.c.sub=null},
  tog(e){setP(e.dataset.path,!getP(e.dataset.path))},
  set(e){const v=e.dataset.num?+e.dataset.v:e.dataset.v;setP(e.dataset.path,v)},
  editItem(e){S.r.item=e.dataset.id;S.r.sub='item';S.r.confirmDel=false},
  addItem(){const id='n'+rnd(5);S.menu.items.push({id,cat:S.menu.cats[0].id,name:'Nouveau produit',desc:'',price:500,avail:true,opts:[]});S.r.item=id;S.r.sub='item'},
  delItem(){if(!S.r.confirmDel){S.r.confirmDel=true;return}
    const id=S.r.item;S.menu.items=S.menu.items.filter(i=>i.id!==id);S.lines=S.lines.filter(l=>l.id!==id);S.r.sub=null;S.r.confirmDel=false;toast('Produit supprimé.')},
  addOpt(){const n=S.r.newOptName.trim();if(!n){toast('Donnez un nom à l\'option.');return}
    S.menu.items[itemIdx(S.r.item)].opts.push({name:n,delta:S.r.newOptDelta||0});S.r.newOptName='';S.r.newOptDelta=0},
  delOpt(e){S.menu.items[itemIdx(S.r.item)].opts.splice(+e.dataset.k,1)},
  addCat(){const n=S.r.newCat.trim();if(!n){toast('Donnez un nom à la catégorie.');return}S.menu.cats.push({id:'c'+rnd(4),name:n});S.r.newCat=''},
  link(e){S.links[e.dataset.k]=e.dataset.v;toast(e.dataset.v==='approved'?'Livreur accepté.':'Livreur retiré.')},
  reqLink(e){S.links[e.dataset.k]='pending';toast('Demande envoyée au restaurant.')},
  hview(e){S.hm.view=e.dataset.v},hf(e){S.hm.f[e.dataset.v]=!S.hm.f[e.dataset.v]},hclear(){S.hm.f={open:false,pickup:false,delivery:false,hh:false};S.hm.q=''},
  toastDemo(){toast('Dans la démo, seul Chez Samir prend des commandes.')},
  sched(e){S.sched=e.dataset.v},slot(e){S.slot=e.dataset.v},
  upgrade(){S.shop.plan='pro';toast('Formule Pro activée : les fonctions Pro sont débloquées.')},
  plan(e){S.shop.plan=e.dataset.v;toast(e.dataset.v==='pro'?'Formule Pro : abonnement modifié, au prorata.':'Formule Start : les réglages Pro sont conservés mais inactifs.')},
  cplan(e){S.cplan=e.dataset.v;if(S.load>cap())S.load=cap();toast(e.dataset.v==='pro'?'Livreur Pro : 2 courses et livraisons de nuit.':'Livreur Start : une course à la fois.')},
  toastPortal(){toast('Dans l\'app, ce bouton ouvre le portail Stripe.')},toastDocs(){toast('Dans l\'app, le document est vérifié par Stripe.')},
};
function addLine(it,sel){
  const opts=it.opts.filter(p=>sel.includes(p.name));
  const price=unit(it)+opts.reduce((s,p)=>s+p.delta,0), key=it.id+'|'+opts.map(p=>p.name).sort().join(',');
  const l=S.lines.find(l=>l.key===key);
  if(l)l.q++;else S.lines.push({key,id:it.id,name:it.name,opts:opts.map(p=>p.name),price,q:1});
}
document.addEventListener('click',ev=>{
  const t=ev.target.closest('[data-act]');
  if(t){const a=t.dataset.act;
    if(a.startsWith('ksub:')){S.k.sub=a.slice(5)}
    else if(a.startsWith('sub:')){S.r.sub=a.slice(4)}
    else if(a.startsWith('csub:')){S.c.sub=a.slice(5)}
    else if(A[a])A[a](t);
    render();return}
  const tab=ev.target.closest('[data-tab]');
  if(tab){S.tab=tab.dataset.tab;render()}
});
document.addEventListener('input',ev=>{
  const el=ev.target;if(!el.dataset||!el.dataset.path)return;
  let v=el.value;const ty=el.dataset.type;
  if(ty==='eur')v=Math.max(0,Math.round((parseFloat(String(v).replace(',','.'))||0)*100));
  else if(['pickIn','dcodeIn'].includes(el.dataset.path))v=v.replace(/\D/g,'');
  setP(el.dataset.path,v);
  if(el.dataset.path==='hm.q')render();else renderExcept(el.closest('.phone').id);
});
$('reset').addEventListener('click',()=>{const tab=S.tab;S=fresh();S.tab=tab;render()});
setInterval(()=>{
  const x=o();
  document.querySelectorAll('[data-count]').forEach(el=>{el.textContent=mmss(+el.dataset.count-Date.now())});
  if(x&&x.courier&&x.ridePay==='card'&&!x.ridePaid&&x.due&&Date.now()>=x.due&&x.status!=='delivered'){
    const who=x.courier;S.sheet=null;
    releaseMission('Livraison non réglée à temps : la mission est repartie dans le pool.','Délai dépassé : la mission repart dans le pool.');
    if(who==='Léa')x.skipKarim=false;
    render();
  }
},1000);
render();
