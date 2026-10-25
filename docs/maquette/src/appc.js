/* ---------- Client : tableau de bord ---------- */
const KTABS=[['home','À proximité','pin'],['orders','Commandes','list'],['loy','Fidélité','gift'],['me','Compte','user']];
function client(){
  const k=S.k, tb=tabbar('k',KTABS,k.tab);
  if(k.tab==='orders') return k.sub==='order'?clientOrder():clientOrders(tb);
  if(k.tab==='loy') return clientLoyalty(tb);
  if(k.tab==='me') return k.sub?clientSub(k.sub):clientMe(tb);
  const x=o(), top=(S.view==='home'&&!x)||(x&&S.view==='home');
  const h=clientMain();
  return top?h+tb:h;
}
const modeLbl=m=>m==='delivery'?'Livraison':'À emporter';
function clientOrders(tb){
  const x=o(), act=x&&!['delivered','refused'].includes(x.status);
  const live=x?`<div class="sec">En cours</div><button class="card" data-act="ktab" data-v="home" style="text-align:left;border-color:var(--green)"><div class="row"><div class="f"><div class="sub">${esc(S.shop.name)}</div><div class="mute">${x.items.map(l=>l.q+' × '+esc(l.name)).join(', ')}</div></div><span class="badge${act?'':' k'}">${({placed:'Envoyée',accepted:'Acceptée',ready:'Prête',out:'En route',delivered:'Livrée',refused:'Refusée'})[x.status]}</span></div><div class="mute">Suivre ma commande ›</div></button>`:'';
  return page('Mes commandes',null,live+`<div class="sec">Historique</div>`+S.corders.map(c=>`<button class="card" data-act="kopen" data-id="${c.id}" style="text-align:left"><div class="row"><div class="f"><div class="sub">${esc(c.shop)}</div><div class="mute">${esc(c.when)} · ${modeLbl(c.mode)}</div><div class="mute">${c.items.map(esc).join(', ')}</div></div><div class="price">${euro(c.total+c.fee)}</div></button>`.replace('</button>','</div></button>')).join(''),'',tb);
}
function clientOrder(){
  const c=S.corders.find(c=>c.id===S.k.oi)||S.corders[0];
  return page('Détail','kback',`
   <div class="card"><div class="sub">${esc(c.shop)}</div><div class="mute">${esc(c.when)} · ${modeLbl(c.mode)} · payé ${c.pay}</div>
    ${c.items.map(t=>`<div class="row"><div class="f">${esc(t)}</div></div>`).join('')}
    <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
    <div class="row"><div class="f">Repas</div><div class="price">${euro(c.total)}</div></div>
    ${c.mode==='delivery'?`<div class="row"><div class="f">Frais de livraison</div><div class="price">${euro(c.fee)}</div></div>`:''}
    <div class="row"><div class="f"><b>Total</b></div><div class="price">${euro(c.total+c.fee)}</div></div>
    <div class="mute">Aucun frais de service. Le restaurant et le livreur sont payés directement.</div></div>
   <div class="card"><div class="row"><div class="f">Ma note</div><span class="stars">${c.stars?stars(c.stars):'<span class="mute">Pas encore noté</span>'}</span></div></div>
   <button class="btn ghost" data-act="toastK">Télécharger la facture</button>`,
   c.shop===S.shop.name?'<button class="btn" data-act="reorder">Commander à nouveau</button>':'');
}
function clientMe(tb){
  const m=S.me, def=m.addrs.find(a=>a.def);
  return page('Compte',null,`
   <div class="card"><div class="row"><div class="av">${esc(m.name[0])}</div><div class="f"><div class="h">${esc(m.name)}</div><div class="mute">${esc(m.email)} <span class="ok">✓ confirmé</span></div><div class="mute">${esc(m.phone)} · facultatif</div></div></div></div>
   <div class="card" style="padding:4px 12px">
    ${row('Informations personnelles',esc(m.name)+' · '+esc(m.phone),'ksub:info')}
    ${row('Adresses',m.addrs.length+' enregistrées · '+esc(def.label),'ksub:addr')}
    ${row('Paiements','Directement aux professionnels','ksub:pay')}
    ${row('Restaurants favoris',Object.values(m.favs).filter(Boolean).length+' favori(s)','ksub:fav')}
    ${row('Notifications',m.notif.push?'Activées':'Désactivées','ksub:notif')}
    ${row('Aide et contact','contact@aiworkpay.fr','toastK')}
    ${row('Supprimer mon compte','Efface vos données personnelles','toastK')}</div>
   <button class="btn ghost" data-act="toastK">Se déconnecter</button>`,'',tb);
}
function clientSub(s){
  const m=S.me;let t='',b='';
  if(s==='info'){t='Informations';b=field('Nom','me.name')+field('Téléphone','me.phone',{mode:'tel'})+field('E-mail','me.email')}
  if(s==='addr'){t='Adresses';b=m.addrs.map(a=>`<div class="card"><div class="row"><div class="f"><div class="sub">${esc(a.label)} ${a.def?'<span class="badge">Par défaut</span>':''}</div><div class="mute">${esc(a.line)}</div></div></div>
     <div class="row">${a.def?'':`<button class="btn sm ghost" data-act="defAddr" data-id="${a.id}">Par défaut</button>`}<button class="btn sm ghost" data-act="delAddr" data-id="${a.id}">Supprimer</button></div></div>`).join('')+
     `<div class="card">${field('Nouvelle adresse','k.newAddr')}<button class="btn sm" data-act="addAddr">Ajouter</button></div>`}
  if(s==='pay'){t='Paiements';b=`<div class="card"><div class="sub">Aucune carte à enregistrer</div><div class="mute">Vous réglez le repas au restaurant et la livraison au livreur, directement, avec le lien de paiement de chacun (carte, Apple Pay, Google Pay) ou en espèces selon les établissements. Le professionnel confirme la réception.</div></div><div class="note ok">ZeeRoo n'encaisse jamais l'argent de vos commandes et ne prélève aucun frais de service.</div>`}
  if(s==='fav'){t='Favoris';b=[['samir',S.shop.name,'Sandwicherie'],['bella','Bella Pizza','Pizzeria'],['petit','Le Petit Four','Boulangerie']].map(([k,n,c])=>`<div class="lr"><div class="f"><div class="sub">${esc(n)}</div><div class="mute">${c}</div></div><button class="chip" aria-pressed="${!!m.favs[k]}" data-act="fav" data-k="${k}">${m.favs[k]?'♥ Favori':'♡ Ajouter'}</button></div>`).join('')}
  if(s==='notif'){t='Notifications';b=[['push','Suivi de commande (notifications)']].map(([k,l])=>`<div class="lr"><div class="f">${l}</div>${sw('me.notif.'+k,m.notif[k])}</div>`).join('')}
  return page(t,'kback',b,'<button class="btn" data-act="kback">Enregistrer</button>');
}

function clientLoyalty(tb){
  const n=Math.min(9,S.stamps);
  return page('Fidélité',null,`
   <div class="card"><div class="row"><div class="sub f">${esc(S.shop.name)}</div><b>${n} / 9</b></div>
    <div class="pgrid" role="img" aria-label="${n} menus sur 9, puis un menu offert">${Array.from({length:9},(_,i)=>`<i class="${i<n?'on':''}">${i+1}</i>`).join('')}<i class="gift">offert</i></div>
    <div class="mute">${n>=9?'Votre prochain menu est offert !':'Plus que '+(9-n)+' menu'+(9-n>1?'s':'')+' pour un menu offert. Le restaurant l\'offre lui-même.'}</div></div>
   <div class="note">9 menus achetés chez un restaurant, le 10<sup>e</sup> est offert par ce restaurant. Seuls les menus choisis par le restaurant comptent.</div>`,'',tb);
}
