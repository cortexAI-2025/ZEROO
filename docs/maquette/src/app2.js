/* ---------- Restaurant ---------- */
const RTABS=[['orders','Commandes','list'],['menu','Menu','menu'],['stats','Activité','chart'],['shop','Boutique','shop'],['account','Compte','user']];
const DAYS=['Lun','Mar','Mer','Jeu','Ven','Sam','Auj.'];
const REV=[38600,41250,29800,45500,61200,74800,18600], ORD=[27,29,21,31,42,51,12];
const COURIERS={karim:{name:'Karim B.',veh:'Scooter',rating:4.9,trips:212},lea:{name:'Léa M.',veh:'Vélo',rating:4.8,trips:96},tom:{name:'Tom R.',veh:'Voiture',rating:null,trips:0}};
function resto(){
  const r=S.r, tb=tabbar('r',RTABS,r.tab);
  if(r.sub) return restoSub(r.sub);
  if(r.tab==='menu') return restoMenu(tb);
  if(r.tab==='stats') return restoStats(tb);
  if(r.tab==='shop') return restoShop(tb);
  if(r.tab==='account') return restoAccount(tb);
  return restoOrders(tb);
}
function liveOrder(){
  const x=o();
  if(!x) return `<div class="empty" style="padding:28px 12px"><div class="h">Aucune commande en cours</div><p>Les commandes arrivent ici avec une alerte sonore.</p></div>`;
  const d=x.fulfil==='delivery';
  const head=`<div class="row"><div class="f"><div class="sub">Nadia · ${d?'🛵 Livraison':'À emporter'}</div><div class="mute">Code ${x.code}${x.when?' · 🗓️ programmée '+x.when:''}</div></div><span class="badge ${x.status==='placed'?'w':''}">${{placed:'Nouvelle',accepted:'En préparation',ready:'Prête',out:'Partie',delivered:'Terminée'}[x.status]}</span></div>
    ${x.items.map(l=>`<div class="row"><div class="f">${l.q} × ${esc(l.name)}</div></div>`).join('')}
    <div class="mute">${euro(x.total)} · ${x.mealPay==='cash'?'espèces au comptoir':'carte via votre lien de paiement'}</div>
    ${x.mealPay!=='card'||x.status==='placed'||x.status==='refused'?'':x.mealPaid?`<div class="note ok">Repas payé : ${euro(x.total)} reçus.</div>`
      :`<div class="note">${x.mealDeclared?'Le client indique avoir payé '+euro(x.total)+' : vérifiez la réception.':'En attente du paiement du client ('+euro(x.total)+').'}</div><button class="btn sm" data-act="confirmMeal">Paiement reçu</button>`}`;
  let act='';
  if(x.status==='placed') act=`<div class="mute">Temps de préparation</div><div class="chips">${[10,15,20,30].map(m=>`<button class="chip" aria-pressed="${S.prep===m}" data-act="prep" data-v="${m}">${m} min</button>`).join('')}</div>
    <button class="btn" data-act="accept">Accepter</button><button class="btn ghost" data-act="refuse">Refuser</button>`;
  else if(x.status==='accepted') act=`<button class="btn" data-act="ready">Commande prête</button>`;
  else if(x.status==='ready'&&!d) act=`<input class="t" data-path="pickIn" inputmode="numeric" maxlength="4" placeholder="Code" value="${S.pickIn}" aria-label="Code de retrait"><div class="mute">Code du client : ${x.code}</div><button class="btn" data-act="collect">${x.mealPay==='cash'?'Remettre et encaisser en espèces':'Remettre au client'}</button>`;
  else if(x.status==='ready'&&d) act=`<div class="note ${x.courier?(x.ridePay==='card'&&!x.ridePaid?'':'ok'):''}">${!x.courier?'Aucun livreur n\'a encore pris la livraison. Elle est proposée à vos livreurs.':(x.ridePay==='card'&&!x.ridePaid?`${x.courier} attend le paiement de la livraison par le client (vous pouvez remettre la commande).`:`${x.courier} est là pour récupérer la commande.`)}</div>
    <input class="t" data-path="pickIn" inputmode="numeric" maxlength="4" placeholder="Code" value="${S.pickIn}" aria-label="Code de retrait du livreur"><div class="mute">Le livreur présente le code ${x.code}</div>
    <button class="btn" data-act="handover">Remettre au livreur</button>`;
  if(x.status==='accepted'&&d) act=`<div class="note">${x.courier?x.courier+' a pris la livraison.':'Un livreur va être trouvé parmi vos livreurs.'}</div>`+act;
  if(x.status==='out') act=`<div class="note ok">Commande remise à ${x.courier}.</div>`;
  if(x.status==='delivered') act=`<div class="note ok">Terminée${x.mealPay==='cash'?' · espèces encaissées':''}. Aucune commission prélevée.</div>`;
  if(x.status==='refused') act=`<div class="note bad">Refusée. Le client n'a pas été débité.</div>`;
  return `<div class="card" style="border-color:var(--green)">${head}${act}${S.restoErr?`<div class="note bad">${S.restoErr}</div>`:''}</div>`;
}
function restoOrders(tb){
  const rev=REV[6]+S.doneToday.rev, n=ORD[6]+S.doneToday.n;
  return page('Commandes',null,`
   <div class="card"><div class="row"><div class="f"><div class="sub">Recevoir des commandes</div><div class="mute">${S.shop.open?'Les clients peuvent commander.':'En pause : vos clients voient « fermé ».'}</div></div>${sw('shop.open',S.shop.open)}</div></div>
   ${liveOrder()}
   <div class="grid2"><div class="stat"><b>${euro(rev)}</b><span>Aujourd'hui</span></div><div class="stat"><b>${n}</b><span>Commandes</span></div></div>
   <div class="sec">Aujourd'hui</div>
   ${S.hist.map(h=>`<div class="row"><div class="mute" style="width:42px">${h.t}</div><div class="f">${esc(h.who)} <span class="mute">· ${h.mode}</span></div><div class="price">${euro(h.total)}</div></div>`).join('')}`,'',tb);
}
function restoMenu(tb){
  const m=S.menu;
  return page('Menu',null,`
   <div class="mute">${m.items.length} produits · ${m.items.filter(i=>!i.avail).length} épuisé(s). Les changements sont visibles tout de suite chez le client.</div>
   ${m.cats.map(c=>{const its=m.items.filter(i=>i.cat===c.id);return `<div class="sec">${esc(c.name)}</div><div class="card" style="padding:4px 10px">`+(its.length?its.map(i=>`
     <div class="lr"><button class="f" style="text-align:left" data-act="editItem" data-id="${i.id}"><div class="sub" ${i.avail?'':'style="color:var(--mute)"'}>${esc(i.name)}</div><div class="mute">${euro(i.price)}${i.opts.length?' · '+i.opts.length+' option(s)':''}${i.avail?'':' · épuisé'}</div></button>
     ${sw('menu.items.'+itemIdx(i.id)+'.avail',i.avail)}</div>`).join(''):'<div class="mute" style="padding:10px 0">Aucun produit dans cette catégorie.</div>')+`</div>`}).join('')}
   <div class="card"><div class="sub">Nouvelle catégorie</div><div class="row"><input class="in" data-path="r.newCat" placeholder="Ex. Salades" value="${esc(S.r.newCat)}"><button class="btn sm" data-act="addCat">Ajouter</button></div></div>`,
   `<button class="btn" data-act="addItem">+ Ajouter un produit</button>`,tb);
}
function restoStats(tb){
  const rev=REV.map((v,i)=>i===6?v+S.doneToday.rev:v), ord=ORD.map((v,i)=>i===6?v+S.doneToday.n:v);
  const wr=rev.reduce((a,b)=>a+b,0), wo=ord.reduce((a,b)=>a+b,0);
  const top=[['Kebab galette',142],['Menu américain',96],['Frites maison',88],['Boisson 33 cl',71]];const tm=top[0][1];
  return page('Activité',null,`
   <div class="grid2"><div class="stat"><b>${euro(wr)}</b><span>Cette semaine</span></div><div class="stat"><b>${wo}</b><span>Commandes</span></div>
   <div class="stat"><b>${euro(Math.round(wr/wo))}</b><span>Panier moyen</span></div><div class="stat"><b><span class="stars">★</span> ${avg(S.rating.r).toFixed(2)}</b><span>${S.rating.r.count} avis</span></div></div>
   <div class="card"><div class="sub">Chiffre d'affaires par jour</div>${barChart(rev,DAYS,v=>euro(v))}</div>
   <div class="card"><div class="sub">Produits les plus vendus (7 jours)</div>${top.map(([n,c])=>`<div class="dist"><span style="width:104px;color:var(--ink)">${n}</span><span class="tr"><i style="width:${Math.round(c/tm*100)}%"></i></span><span>${c}</span></div>`).join('')}</div>
   ${isPro()?`<div class="card"><div class="row"><div class="sub f">Heures de pointe</div><span class="badge pro">PRO</span></div>${barChart([6,31,18,9,4,22,34,12],['11h','12h','13h','14h','17h','19h','20h','21h'],v=>v+' cmd')}<div class="mute">Clients fidèles : 38 % des commandes · Happy Hour : 14 % · Retrait 61 % / livraison 39 %.</div></div>`
     :`<div class="card lock"><div class="row"><div class="sub f">Statistiques avancées</div><span class="badge pro">PRO</span></div><div class="mute">Période étendue, heures de pointe, clients fidèles, modes de commande et Happy Hour. Vous voyez ici les 7 derniers jours.</div><button class="btn sm" data-act="upgrade">Passer en Pro</button></div>`}
   <div class="note ok"><b>Commission ZeeRoo : 0,00 €</b><br>Vos clients vous paient directement, par carte via votre lien de paiement ou en espèces.</div>
   <div class="card"><div class="sub">Répartition des paiements</div>
     <div class="dist"><span style="width:104px;color:var(--ink)">Carte (votre lien)</span><span class="tr"><i style="width:78%"></i></span><span>78 %</span></div>
     <div class="dist"><span style="width:104px;color:var(--ink)">Espèces</span><span class="tr"><i style="width:22%"></i></span><span>22 %</span></div></div>`,'',tb);
}
function restoShop(tb){
  const s=S.shop,pend=Object.values({t:S.links.tom}).filter(v=>v==='pending').length,pro=isPro();
  const prow=(title,sub,act)=>row(title,pro?sub:'Réservé à la formule Pro',act,pro?'':'<span class="badge pro">PRO</span>');
  return page('Boutique',null,`
   <div class="card"><div class="row"><div class="tile" style="background:var(--ink)">${esc(s.name[0]||'?')}</div><div class="f"><div class="sub">${esc(s.name)}</div><div class="mute">${esc(s.cat)} · ${esc(s.city)}</div><div class="mute"><span class="stars">★</span> ${avg(S.rating.r).toFixed(1)} · ${S.rating.r.count} avis</div></div></div>
     <div class="row"><div class="f"><div class="sub">Visible des clients</div></div>${sw('shop.published',s.published)}</div></div>
   <div class="card" style="padding:0 12px">
     ${row('Informations du commerce','Raison sociale, SIRET, adresse, contact','sub:info')}
     ${row('Horaires d\'ouverture',s.hours.filter(h=>h.on).length+' jours par semaine','sub:hours')}
     ${row('Fermetures exceptionnelles','Congés, jours fériés','sub:close')}
     ${row('Livraison',s.deliveryOn?'Activée · '+euro(s.fee)+' · '+s.radius/1000+' km':'Désactivée','sub:delivery')}
     ${row('Mes livreurs',Object.values({a:S.links.karim,b:S.links.lea}).filter(v=>v==='approved').length+' actifs'+(pend?' · '+pend+' demande':''),'sub:couriers',pend?'<span class="badge w">Nouveau</span>':'')}
     ${row('Lien de paiement',(s.payLink?'SumUp · actif':'À renseigner')+' · espèces au comptoir '+(s.cash?'activées':'désactivées'),'sub:pay')}
   </div>
   <div class="sec">Visibilité et ventes</div>
   <div class="card" style="padding:0 12px">
     ${row('QR code à afficher','Lien direct vers votre menu','sub:qr')}
     ${row('Paniers anti-gaspi',s.basketOn?'Activés · 3 paniers':'Désactivés','sub:baskets')}
     ${prow('Happy Hours',s.hhOn?'1 offre active':'Offre désactivée','sub:hh')}
     ${prow('Mini-site dans l\'annuaire','app.zeeroo.fr/m/chez-samir','sub:mini')}
     ${prow('Commandes groupées entreprises',s.groupOn?'Activées · 5 convives minimum':'Désactivées','sub:group')}
     ${prow('Campagne mensuelle','Réseaux ZEEROO · après validation','sub:camp')}
     ${row('Historique des commandes','','toastK')}
   </div>
   <div class="card" style="padding:0 12px">${row('Abonnement',(isPro()?'Établissement Pro':'Établissement Start')+' · essai gratuit','sub:plan')}</div>`,'',tb);
}
function restoAccount(tb){
  return page('Compte',null,`
   <div class="card"><div class="row"><div class="av">S</div><div class="f"><div class="h">Samir</div><div class="mute">samir@chezsamir.fr <span class="ok">✓ confirmé</span></div><div class="mute">Connexion par e-mail</div></div></div></div>
   <div class="note ok">Votre e-mail est confirmé : votre espace professionnel est ouvert. Aucune autre vérification n'est demandée.</div>
   <div class="card" style="padding:4px 12px">${row('Notifications','Nouvelles commandes, alertes sonores','toastK')}${row('Aide et contact','contact@aiworkpay.fr','toastK')}${row('Supprimer mon compte','Efface vos données personnelles','toastK')}</div>
   <button class="btn ghost" data-act="toastK">Se déconnecter</button>`,'',tb);
}
function restoSub(sub){
  const s=S.shop, back='rback';
  if(sub==='info') return page('Informations',back,`
    <div class="sec">Entreprise</div>${field('Nom commercial','shop.name')}${field('Raison sociale','shop.legal')}
    ${field('SIRET','shop.siret',{mode:'numeric'})}<div class="mute ${luhn(s.siret)?'ok':'danger'}">${luhn(s.siret)?'SIRET valide ✓':'SIRET invalide : 14 chiffres, clé de contrôle fausse.'}</div>
    ${field('N° de TVA','shop.tva')}
    <div class="sec">Adresse et contact</div>${field('Adresse','shop.addr')}<div class="grid2">${field('Code postal','shop.cp',{mode:'numeric'})}${field('Ville','shop.city')}</div>
    ${field('Téléphone','shop.phone',{mode:'tel'})}${field('E-mail','shop.email')}
    <div class="sec">Présentation</div><div class="mute">Catégorie</div>${chips('shop.cat',['Sandwicherie','Restaurant','Boulangerie','Snack','Dark kitchen'],s.cat)}
    ${field('Description','shop.desc',{area:true})}`,'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='hours') return page('Horaires',back,s.hours.map((h,i)=>`<div class="card"><div class="row"><div class="f sub">${['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'][i]}</div>${h.on?'':'<span class="mute">Fermé</span>'}${sw('shop.hours.'+i+'.on',h.on)}</div>
    ${h.on?`<div class="grid2">${field('Ouverture','shop.hours.'+i+'.from',{type:'time'})}${field('Fermeture','shop.hours.'+i+'.to',{type:'time'})}</div>`:''}</div>`).join(''),'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='delivery') return page('Livraison',back,`
    <div class="card"><div class="row"><div class="f"><div class="sub">Proposer la livraison</div><div class="mute">Vos clients choisissent le retrait ou la livraison par un livreur indépendant rattaché à votre restaurant.</div></div>${sw('shop.deliveryOn',s.deliveryOn)}</div></div>
    <div class="card"><div class="sub">Prix de la livraison</div><div class="mute">Payé par le client directement au livreur. Vous ne payez rien et ne prélevez rien.</div>${chips('shop.fee',[250,300,350,400,500],s.fee,euro).replace(/data-v="(\d+)"/g,'data-v="$1" data-num="1"')}
     <div class="sub">Zone de livraison</div>${chips('shop.radius',[1000,2000,3000,5000],s.radius,v=>v/1000+' km').replace(/data-v="(\d+)"/g,'data-v="$1" data-num="1"')}</div>
    ${s.deliveryOn&&!linkedOk()?'<div class="note bad">Aucun livreur actif : la livraison n\'est pas proposée à vos clients.</div>':''}`,'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='couriers'){
    const list=['karim','lea','tom'].map(k=>{const c=COURIERS[k],st=S.links[k];
      return `<div class="card"><div class="row"><div class="av" style="width:44px;height:44px;font-size:17px">${c.name[0]}</div><div class="f"><div class="sub">${c.name}</div><div class="mute">${c.veh}${c.rating?` · ★ ${c.rating} · ${c.trips} courses`:' · nouveau livreur'}</div></div>
        <span class="badge ${st==='approved'?'':'w'}">${st==='approved'?'Actif':st==='pending'?'Demande':'Retiré'}</span></div>
        <div class="row">${st==='pending'?`<button class="btn sm" data-act="link" data-k="${k}" data-v="approved">Accepter</button><button class="btn sm ghost" data-act="link" data-k="${k}" data-v="rejected">Refuser</button>`:st==='approved'?`<button class="btn sm ghost" data-act="link" data-k="${k}" data-v="rejected">Retirer</button>`:'<span class="mute">Ne reçoit plus vos missions.</span>'}</div></div>`}).join('');
    return page('Mes livreurs',back,`<div class="mute">Les livreurs indépendants de votre secteur demandent à livrer pour vous. Vous acceptez ou refusez chaque demande.</div>${list}`);
  }
  if(sub==='pay') return page('Lien de paiement',back,`
    <div class="card"><div class="sub">Votre page de paiement</div>
      <div class="mute">Vos clients vous paient par carte, Apple Pay ou Google Pay sur la page de votre fournisseur (SumUp, PayPal, Stripe Payment Link, Lydia Pro…). L'argent arrive sur votre compte bancaire ; ZeeRoo n'encaisse rien.</div>
      ${field('Adresse de la page','shop.payLink')}
      <div class="mute">Vous confirmez chaque paiement reçu dans l'onglet Commandes.</div></div>
    <div class="card"><div class="row"><div class="f"><div class="sub">Espèces au comptoir</div><div class="mute">Retrait uniquement. La commande part sans paiement en ligne et vous encaissez au retrait.</div></div>${sw('shop.cash',s.cash)}</div></div>`,'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='plan') return page('Abonnement',back,`
    <div class="note ok">Essai gratuit de 30 jours en cours. Votre formule : <b>${isPro()?'Établissement Pro':'Établissement Start'}</b>.</div>
    <div class="card" ${isPro()?'':'style="border-color:var(--green)"'}><div class="row"><div class="sub f">Établissement Start</div>${isPro()?'':'<span class="badge">Votre formule</span>'}</div><div class="price">19,99 € HT / mois</div><div class="mute">23,99 € TTC · ou 199,99 € HT par an.</div>
      <div class="mute">Click &amp; Collect et livraison, commandes illimitées et programmées, menu, QR code, fidélité, avis, paniers anti-gaspi. 0 % de commission.</div>${isPro()?'<button class="btn sm ghost" data-act="plan" data-v="start">Passer en Start</button>':''}</div>
    <div class="card" ${isPro()?'style="border-color:var(--green)"':''}><div class="row"><div class="sub f">Établissement Pro</div>${isPro()?'<span class="badge">Votre formule</span>':'<span class="badge pro">PRO</span>'}</div><div class="price">29,99 € HT / mois</div><div class="mute">35,99 € TTC · ou 299,99 € HT par an.</div>
      <div class="mute">Tout Start, plus Happy Hours, mini-site dans l'annuaire, commandes groupées entreprises, statistiques avancées et une campagne mensuelle sur les réseaux ZEEROO.</div>${isPro()?'':'<button class="btn sm" data-act="plan" data-v="pro">Passer en Pro</button>'}</div>
    <div class="mute">Le changement de formule modifie votre abonnement existant, au prorata : jamais un second abonnement. Résiliable à tout moment, vos données sont conservées.</div>
    <button class="btn ghost" data-act="toastPortal">Gérer mon abonnement</button>
    <div class="mute">Seul l'abonnement passe par Stripe (AiWorkPay). Vos ventes vous sont payées directement par vos clients.</div>`);
  const proGate=(title,body,foot)=>isPro()?page(title,back,body,foot||'<button class="btn" data-act="rback">Terminé</button>'):page(title,back,`<div class="card lock"><div class="row"><div class="sub f">${title}</div><span class="badge pro">PRO</span></div><div class="mute">Cette fonction est réservée à la formule Établissement Pro. Vos réglages sont conservés si vous repassez en Start.</div></div>`,'<button class="btn" data-act="upgrade">Passer en Pro</button>');
  if(sub==='hh') return proGate('Happy Hours',`
    <div class="mute">Des prix réduits sur des créneaux choisis, avec quota et contrôle du stock à la commande.</div>
    <div class="card"><div class="row"><div class="f"><div class="sub">Menu américain</div><div class="mute"><span class="strike">${euro(950)}</span>${euro(800)} · lun.–ven. 14:00–18:00 · quota 20</div></div>${sw('shop.hhOn',s.hhOn)}</div></div>
    <div class="note ${s.hhOn?'ok':''}">${s.hhOn?'Offre active : vos clients voient le prix Happy Hour dans l\'annuaire et dans le menu (regardez le téléphone Client).':'Offre désactivée : le prix normal s\'applique.'}</div>`);
  if(sub==='mini') return proGate('Mini-site',`
    <div class="card"><div class="sub">Votre page dans l'annuaire ZEEROO</div><div class="mute">Menu, horaires, photos, avis et commande directe, sur une adresse à vous.</div><div class="price">app.zeeroo.fr/m/chez-samir</div></div>
    <img class="qr" src="__QR__" alt="QR code vers votre mini-site">
    <div class="mute" style="text-align:center">Imprimez-le ou affichez-le en vitrine. Vos anciens QR codes continuent de fonctionner.</div>`);
  if(sub==='group') return proGate('Commandes groupées',`
    <div class="card"><div class="row"><div class="f"><div class="sub">Accepter les commandes groupées</div><div class="mute">Pour les équipes et les entreprises : commande programmée, entreprise et nombre de convives.</div></div>${sw('shop.groupOn',s.groupOn)}</div></div>
    <div class="card"><div class="mute">Délai minimum</div><div class="sub">24 h à l'avance</div><div class="mute">Effectif minimum</div><div class="sub">5 convives</div><div class="mute">Réglée directement à votre établissement, sans facturation ZeeRoo.</div></div>`);
  if(sub==='camp') return proGate('Campagne mensuelle',`
    <div class="card"><div class="sub">Une campagne par mois sur les réseaux ZEEROO</div><div class="mute">Programmée à la date de renouvellement de votre abonnement, après confirmation du paiement. Le contenu est validé par l'équipe ZEEROO avant publication.</div></div>
    <div class="card"><div class="row"><div class="f"><div class="sub">J'autorise ZEEROO à présenter mon établissement</div></div>${sw('shop.mktOn',s.mktOn)}</div></div>
    <div class="note">Aucune campagne n'est créée sans votre accord, ni après une résiliation ou un paiement non confirmé.</div>`);
  if(sub==='qr') return page('QR code',back,`
    <img class="qr" src="__QR__" alt="QR code vers votre menu">
    <div class="mute" style="text-align:center">app.zeeroo.fr/m/chez-samir</div>
    <div class="note">Affichez-le en vitrine : vos clients ouvrent directement votre menu. Vos anciens QR codes continuent de fonctionner.</div>`,'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='baskets') return page('Paniers anti-gaspi',back,`
    <div class="card"><div class="row"><div class="f"><div class="sub">Vendre mes invendus</div><div class="mute">En fin de journée, des paniers surprise à prix réduit : un complément, pas le cœur du service.</div></div>${sw('shop.basketOn',s.basketOn)}</div></div>
    ${s.basketOn?'<div class="card"><div class="sub">Panier surprise</div><div class="mute">3 paniers · 4,00 € au lieu de 12,00 € · retrait 21:30–22:00</div></div>':''}`,'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='close') return page('Fermetures',back,`
    <div class="mute">Les clients ne peuvent pas commander pendant une fermeture.</div>
    <div class="card"><div class="sub">Congés d'été</div><div class="mute">du 3 au 17 août</div></div>
    <button class="btn ghost" data-act="toastK">+ Ajouter une fermeture</button>`,'<button class="btn" data-act="rback">Terminé</button>');
  if(sub==='item') return restoItem();
  return '';
}
function restoItem(){
  const i=itemIdx(S.r.item), it=S.menu.items[i]; if(!it) return page('Produit','rback','');
  const p='menu.items.'+i;
  return page('Produit','rback',`
    ${field('Nom',p+'.name')}${field('Description',p+'.desc',{area:true})}${field('Prix (€)',p+'.price',{type:'eur',mode:'decimal'})}
    ${it.price<50?'<div class="mute danger">Minimum 0,50 € (limite du paiement par carte).</div>':''}
    <div class="mute">Catégorie</div><div class="chips">${S.menu.cats.map(c=>`<button class="chip" aria-pressed="${it.cat===c.id}" data-act="set" data-path="${p}.cat" data-v="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <div class="card"><div class="row"><div class="f"><div class="sub">Disponible</div><div class="mute">Désactivez pour marquer « épuisé ».</div></div>${sw(p+'.avail',it.avail)}</div></div>
    <div class="card"><div class="sub">Options et suppléments</div>
      ${it.opts.length?it.opts.map((op,k)=>`<div class="row"><div class="f">${esc(op.name)}</div><div class="price">${op.delta?'+'+euro(op.delta):'Offert'}</div><button class="btn sm ghost" data-act="delOpt" data-k="${k}" aria-label="Supprimer l'option">✕</button></div>`).join(''):'<div class="mute">Aucune option.</div>'}
      <div class="row"><input class="in" data-path="r.newOptName" placeholder="Ex. Fromage" value="${esc(S.r.newOptName)}"><input class="in" style="width:84px" data-path="r.newOptDelta" data-type="eur" inputmode="decimal" value="${(S.r.newOptDelta/100).toFixed(2).replace('.',',')}" aria-label="Supplément en euros"></div>
      <button class="btn sm ghost" data-act="addOpt">+ Ajouter l'option</button></div>
    <button class="btn ghost danger" data-act="delItem">${S.r.confirmDel?'Confirmer la suppression':'Supprimer ce produit'}</button>`,'<button class="btn" data-act="rback">Enregistrer</button>');
}
