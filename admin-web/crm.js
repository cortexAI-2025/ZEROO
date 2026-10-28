/* Administrative CRM. All mutations are checked and audited by the server. */
(() => {
  'use strict';
  const $ = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  const date = (v) => (v ? new Date(v).toLocaleString('fr-FR') : '—');
  const statuses = {
    active: 'Actif',
    suspended: 'Suspendu',
    archived: 'Archivé',
    open: 'Ouvert',
    investigating: 'En analyse',
    resolved: 'Résolu',
    closed: 'Clos',
    draft: 'Brouillon',
    follow_up: 'À relancer',
    done: 'Traité',
  };
  const read = async (client, action, id = null, data = {}, offset = 0, request = null) => {
    const r = await client.rpc('admin_console', {
      p_action: action,
      p_id: id,
      p_data: data,
      p_offset: offset,
      p_request: request,
    });
    if (r.error) throw r.error;
    return r.data;
  };
  const button = (text, fn) => {
    const e = $('button', text);
    e.type = 'button';
    e.onclick = fn;
    return e;
  };
  const reason = {
    name: 'reason',
    label: 'Motif de l’action (journalisé)',
    required: true,
    minLength: 3,
    maxLength: 1000,
  };
  function form(host, title, fields, save) {
    const section = $('section');
    section.className = 'crm-form';
    section.append($('h3', title));
    const f = $('form');
    fields.forEach((field) => {
      const label = $('label', field.label);
      let input;
      if (field.options) {
        input = $('select');
        field.options.forEach(([value, text]) => {
          const o = $('option', text);
          o.value = value;
          input.append(o);
        });
      } else input = $(field.type === 'textarea' ? 'textarea' : 'input');
      if (input.tagName === 'INPUT') input.type = field.type || 'text';
      input.name = field.name;
      input.value = field.value ?? '';
      input.required = field.required !== false;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      input.maxLength = field.maxLength || 5000;
      if (field.minLength) input.minLength = field.minLength;
      label.append(input);
      f.append(label);
    });
    const submit = $('button', 'Confirmer');
    submit.type = 'submit';
    const state = $('p');
    state.setAttribute('role', 'status');
    const request = crypto.randomUUID();
    let completed = false;
    f.append(
      submit,
      button('Annuler', () => section.remove()),
      state,
    );
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (completed || submit.disabled) return;
      submit.disabled = true;
      state.textContent = 'Enregistrement…';
      try {
        await save(Object.fromEntries(new FormData(f)), request, state);
        completed = true;
      } catch (error) {
        state.textContent = 'Action impossible : ' + (error.message || error);
      } finally {
        submit.disabled = completed;
      }
    };
    section.append(f);
    host.append(section);
    section.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    return section;
  }
  function table(headers, rows) {
    const wrap = $('div');
    wrap.className = 'table-scroll';
    const t = $('table'),
      head = $('tr');
    headers.forEach((h) => head.append($('th', h)));
    const th = $('thead');
    th.append(head);
    t.append(th);
    const body = $('tbody');
    rows.forEach((row) => {
      const tr = $('tr');
      row.forEach((v) => {
        const td = $('td');
        if (v?.nodeType) td.append(v);
        else td.textContent = String(v ?? '—');
        tr.append(td);
      });
      body.append(tr);
    });
    t.append(body);
    wrap.append(t);
    return wrap;
  }
  function emailLink(email, subject, body) {
    const a = $('a', 'Ouvrir le brouillon dans ma messagerie');
    a.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return a;
  }
  function contactForm(host, client, email = '') {
    return form(
      host,
      'Préparer un message / une relance',
      [
        { name: 'email', label: 'E-mail du destinataire inscrit', type: 'email', value: email },
        { name: 'subject', label: 'Objet', minLength: 3, maxLength: 200 },
        { name: 'body', label: 'Message', type: 'textarea', minLength: 3 },
        {
          name: 'due_at',
          label: 'Date de relance facultative (heure locale)',
          type: 'datetime-local',
          required: false,
        },
        reason,
      ],
      async (data, request, state) => {
        if (data.due_at) data.due_at = new Date(data.due_at).toISOString();
        await read(client, 'contact_create', null, data, 0, request);
        state.replaceChildren(
          $('span', 'Brouillon enregistré. Aucun e-mail envoyé automatiquement. '),
          emailLink(data.email, data.subject, data.body),
        );
      },
    );
  }
  const merchantFields = [
    ['name', 'Nom du commerce'],
    ['phone', 'Téléphone'],
    ['contact_email', 'E-mail professionnel'],
    ['legal_name', 'Raison sociale'],
    ['siret', 'SIRET'],
    ['vat_number', 'Numéro de TVA'],
    ['address_line', 'Adresse'],
    ['postal_code', 'Code postal'],
    ['city', 'Ville'],
    ['latitude', 'Latitude'],
    ['longitude', 'Longitude'],
  ];
  const courierFields = [
    ['display_name', 'Nom du livreur'],
    ['phone', 'Téléphone'],
    ['legal_status', 'Statut juridique'],
    ['siret', 'SIRET'],
    ['vehicle', 'Véhicule'],
    ['work_zone', 'Zone de travail'],
  ];
  function entityFields(kind, data = {}, add = false) {
    const fields = (kind === 'merchant' ? merchantFields : courierFields)
      .filter(
        ([k]) =>
          !add ||
          !['legal_name', 'siret', 'vat_number', 'contact_email'].includes(k) ||
          kind === 'courier',
      )
      .map(([name, label]) => ({
        name,
        label,
        value: data[name],
        required:
          kind === 'merchant'
            ? !['phone', 'contact_email', 'legal_name', 'siret', 'vat_number'].includes(name)
            : name !== 'work_zone',
      }));
    fields.forEach((f) => {
      if (f.name === 'contact_email') f.type = 'email';
      if (['latitude', 'longitude'].includes(f.name)) {
        f.type = 'number';
        f.step = 'any';
        f.min = f.name === 'latitude' ? -90 : -180;
        f.max = -f.min;
      }
      if (f.name === 'legal_status')
        f.options = [
          ['auto_entrepreneur', 'Auto-entrepreneur'],
          ['societe', 'Société'],
        ];
      if (f.name === 'vehicle')
        f.options = [
          ['bike', 'Vélo'],
          ['scooter', 'Scooter'],
          ['car', 'Voiture'],
          ['foot', 'À pied'],
        ];
    });
    if (add) {
      fields.unshift({
        name: 'email',
        label: 'E-mail du compte déjà inscrit dans le bon espace',
        type: 'email',
      });
      if (kind === 'merchant')
        fields.push(
          { name: 'slug', label: 'Adresse de la fiche (ex. chez-samir)' },
          {
            name: 'category',
            label: 'Catégorie',
            options: ['restaurant', 'snack', 'sandwicherie', 'boulangerie', 'autre'].map((v) => [
              v,
              v,
            ]),
          },
        );
    }
    return fields;
  }
  function addEntity(host, kind, client, reload) {
    host.append(
      button(kind === 'merchant' ? 'Ajouter un commerce' : 'Ajouter un livreur', () =>
        form(
          host,
          'Ajouter depuis un compte inscrit sur app.zeeroo.fr',
          [...entityFields(kind, {}, true), reason],
          async (data, request, state) => {
            await read(client, 'add_entity', null, { ...data, kind }, 0, request);
            state.textContent = 'Fiche créée.';
            await reload();
          },
        ),
      ),
    );
  }
  async function actions(host, kind, id, data, client, fresh) {
    const box = $('section');
    box.className = 'crm-actions';
    box.append($('h4', 'Gestion administrateur'));
    host.append(box);
    box.append(
      button('Modifier la fiche', () =>
        form(
          box,
          'Modifier les informations',
          [...entityFields(kind, data.entity), reason],
          async (values, request, state) => {
            await read(client, 'edit_entity', id, { ...values, kind }, 0, request);
            state.textContent =
              'Modification enregistrée. Rouvrez la fiche pour actualiser les informations.';
          },
        ),
      ),
      button('Communiquer / relancer', () =>
        contactForm(box, client, data.account?.email || data.entity?.contact_email || ''),
      ),
    );
    const phone = data.entity?.phone || data.profile?.phone;
    if (phone) {
      const link = $('a', 'Appeler');
      link.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
      box.append(link);
    }
    form(
      box,
      'Modération et suppression par archivage',
      [
        {
          name: 'status',
          label: 'État à appliquer',
          options: [
            ['active', 'Réactiver'],
            ['suspended', 'Suspendre'],
            ['archived', 'Supprimer de l’activité (archiver)'],
          ],
        },
        reason,
      ],
      async (values, request, state) => {
        await read(client, 'set_status', id, { ...values, kind }, 0, request);
        state.textContent =
          'État enregistré. L’historique est conservé. Une réactivation ne republie pas automatiquement un commerce.';
      },
    );
    if (kind === 'merchant')
      form(
        box,
        'Publication dans l’annuaire',
        [
          {
            name: 'published',
            label: 'Publication',
            options: [
              ['true', 'Publier et reprendre les commandes'],
              ['false', 'Dépublier'],
            ],
          },
          reason,
        ],
        async (values, request, state) => {
          await read(
            client,
            'publish',
            id,
            { ...values, published: values.published === 'true' },
            0,
            request,
          );
          state.textContent = 'Publication mise à jour.';
        },
      );
    try {
      const state = await read(client, 'entity_state', id, { kind });
      if (fresh())
        box.prepend(
          $('p', 'État administratif : ' + (statuses[state.admin_status] || state.admin_status)),
        );
    } catch (error) {
      if (fresh()) box.append($('p', 'État inaccessible : ' + error.message));
    }
  }
  function caseForm(host, client, reload, record) {
    const fields = record
      ? [
          {
            name: 'status',
            label: 'Statut',
            options: ['open', 'investigating', 'resolved', 'closed'].map((v) => [v, statuses[v]]),
            value: record.status,
          },
          {
            name: 'resolution',
            label: 'Analyse / conclusion (requise pour clôturer)',
            type: 'textarea',
            value: record.resolution,
            required: false,
          },
        ]
      : [
          { name: 'order_id', label: 'Identifiant de commande (facultatif)', required: false },
          {
            name: 'customer_id',
            label: 'Identifiant client sans commande (facultatif)',
            required: false,
          },
          { name: 'subject', label: 'Objet du litige', maxLength: 200, minLength: 3 },
          { name: 'description', label: 'Description', type: 'textarea', minLength: 3 },
        ];
    form(
      host,
      record ? 'Traiter le litige' : 'Ouvrir un litige',
      [...fields, reason],
      async (data, request) => {
        await read(
          client,
          record ? 'case_update' : 'case_create',
          record?.id || null,
          data,
          0,
          request,
        );
        await reload();
      },
    );
  }
  async function clientDetail(host, client, id, fresh) {
    host.replaceChildren($('p', 'Chargement du dossier client…'));
    try {
      const r = await read(client, 'client_detail', id);
      if (!fresh()) return;
      host.replaceChildren(
        $('h3', r.display_name || r.email),
        $('p', `Identifiant : ${r.id}`),
        $('p', `E-mail : ${r.email || '—'} · Téléphone : ${r.phone || '—'}`),
        $(
          'p',
          `Inscrit : ${date(r.created_at)} · Dernière connexion : ${date(r.last_sign_in_at)} · État : ${statuses[r.admin_status] || r.admin_status}`,
        ),
      );
      host.append(
        button('Communiquer / relancer', () => contactForm(host, client, r.email)),
        button('Ouvrir un litige', () =>
          form(
            host,
            'Litige client',
            [
              { name: 'subject', label: 'Objet' },
              { name: 'description', label: 'Description', type: 'textarea' },
              reason,
            ],
            async (d, req, state) => {
              await read(client, 'case_create', null, { ...d, customer_id: id }, 0, req);
              state.textContent = 'Litige ouvert.';
            },
          ),
        ),
      );
      form(
        host,
        'Modération des nouvelles commandes',
        [
          {
            name: 'status',
            label: 'État',
            options: [
              ['active', 'Autoriser les nouvelles commandes'],
              ['suspended', 'Suspendre les nouvelles commandes'],
              ['archived', 'Archiver et bloquer les nouvelles commandes'],
            ],
          },
          reason,
        ],
        async (d, req, state) => {
          await read(client, 'set_status', id, { ...d, kind: 'client' }, 0, req);
          state.textContent = 'État enregistré.';
        },
      );
      const orderHost = $('section');
      host.append($('h4', 'Historique des commandes (25 par page)'), orderHost);
      let orderVersion = 0;
      async function orders(page, initial) {
        const current = ++orderVersion;
        try {
          const records = initial || (await read(client, 'client_orders', id, {}, page * 25));
          if (!fresh() || current !== orderVersion) return;
          orderHost.replaceChildren(
            $('p', `${records.total} commande(s)`),
            table(
              [
                'Litige',
                'Commande',
                'Commerce',
                'Statut',
                'Montant',
                'Date',
                'Adresse de livraison',
                'Téléphone',
                'Livreur',
                'Paiement enregistré',
              ],
              records.rows.map((o) => [
                button('Ouvrir un litige', () =>
                  form(
                    host,
                    'Litige sur la commande ' + o.id,
                    [
                      { name: 'subject', label: 'Objet' },
                      { name: 'description', label: 'Description', type: 'textarea' },
                      reason,
                    ],
                    async (d, req, state) => {
                      await read(client, 'case_create', null, { ...d, order_id: o.id }, 0, req);
                      state.textContent = 'Litige ouvert.';
                    },
                  ),
                ),
                o.id,
                o.merchant,
                o.status,
                `${(o.total_cents / 100).toFixed(2)} ${o.currency}`,
                date(o.created_at),
                [o.delivery_address_line, o.delivery_postal_code, o.delivery_city]
                  .filter(Boolean)
                  .join(', '),
                o.delivery_phone,
                o.courier_name,
                date(o.paid_at),
              ]),
            ),
          );
          const nav = $('div');
          nav.className = 'pagination';
          const prev = button('Commandes précédentes', () => orders(page - 1)),
            next = button('Commandes suivantes', () => orders(page + 1));
          prev.disabled = page === 0;
          next.disabled = (page + 1) * 25 >= records.total;
          nav.append(prev, $('span', `Page ${page + 1}`), next);
          orderHost.append(nav);
        } catch (error) {
          if (fresh() && current === orderVersion)
            orderHost.replaceChildren($('p', 'Historique inaccessible : ' + error.message));
        }
      }
      await orders(0, { rows: r.orders, total: r.orders_total ?? r.orders.length });
      host.append(
        $('h4', '50 dernières cartes de fidélité'),
        table(
          ['Commerce', 'Progression / 9', 'Récompenses disponibles', 'Utilisées'],
          r.loyalty.map((c) => [
            c.name,
            c.paid_menus_count,
            c.rewards_available,
            c.rewards_redeemed,
          ]),
        ),
      );
    } catch (error) {
      if (fresh()) host.replaceChildren($('p', 'Dossier inaccessible : ' + error.message));
    }
  }
  async function render({ content, tab, client, fresh }) {
    let page = 0,
      version = 0,
      detailVersion = 0,
      filter = {};
    const toolbar = $('div');
    toolbar.className = 'crm-toolbar';
    content.append(toolbar);
    const region = $('div'),
      details = $('aside');
    details.className = 'subscriber-detail';
    content.append(region, details);
    const reload = () => load(page);
    toolbar.append(button('Actualiser', reload));
    if (tab === 'clients' || tab === 'offers') {
      const f = $('form'),
        input = $('input');
      input.placeholder = tab === 'clients' ? 'Nom, e-mail ou téléphone' : 'Ville du commerce';
      input.setAttribute('aria-label', input.placeholder);
      const submit = $('button', 'Rechercher');
      submit.type = 'submit';
      f.append(input, submit);
      f.onsubmit = (e) => {
        e.preventDefault();
        filter = tab === 'clients' ? { search: input.value } : { city: input.value };
        page = 0;
        load(0);
      };
      toolbar.append(f);
    }
    if (tab === 'disputes')
      toolbar.append(button('Ouvrir un litige', () => caseForm(details, client, reload)));
    if (tab === 'communications') {
      toolbar.append(
        $(
          'p',
          'Brouillons et relances manuelles. Aucun message n’est envoyé automatiquement, aucune relance n’est programmée en arrière-plan.',
        ),
        button('Nouveau message / relance', () => contactForm(details, client)),
      );
    }
    if (tab === 'loyalty')
      toolbar.append(
        $(
          'p',
          'Programme existant : 9 menus payés et récupérés = 1 menu offert. Les ajustements administratifs portent uniquement sur les récompenses disponibles.',
        ),
      );
    if (tab === 'offers')
      toolbar.append(
        $(
          'p',
          'Offres Happy Hour liées à la position du commerce. Création en brouillon sur ses produits disponibles, puis activation explicite.',
        ),
        button('Créer une offre', () =>
          form(
            details,
            'Offre géolocalisée par commerce',
            [
              { name: 'merchant_id', label: 'Identifiant du commerce (dans sa fiche)' },
              { name: 'name', label: 'Nom de l’offre', maxLength: 60 },
              { name: 'percent_off', label: 'Réduction (%)', type: 'number', min: 1, max: 90 },
              { name: 'starts_on', label: 'Début', type: 'date' },
              { name: 'ends_on', label: 'Fin', type: 'date' },
              reason,
            ],
            async (data, req) => {
              await read(client, 'offer_create', null, data, 0, req);
              await reload();
            },
          ),
        ),
      );
    async function load(n) {
      const current = ++version;
      page = n;
      details.replaceChildren();
      region.replaceChildren($('p', 'Chargement…'));
      try {
        const r = await read(client, tab, null, filter, n * 25);
        if (!fresh() || current !== version) return;
        const live = () => fresh() && current === version;
        let headers, rows;
        if (tab === 'clients') {
          headers = [
            'Actions',
            'Client',
            'E-mail',
            'Téléphone',
            'État',
            'Commandes',
            'Dernière ville livrée',
          ];
          rows = r.rows.map((c) => [
            button('Dossier client', () => {
              const ticket = ++detailVersion;
              return clientDetail(details, client, c.id, () => live() && ticket === detailVersion);
            }),
            c.display_name,
            c.email,
            c.phone,
            statuses[c.admin_status],
            c.orders_count,
            c.last_city,
          ]);
        } else if (tab === 'reviews') {
          headers = [
            'Modération',
            'Commerce',
            'Livreur',
            'Client',
            'Note resto',
            'Note livreur',
            'Commentaire',
            'Date',
            'État',
          ];
          rows = r.rows.map((c) => [
            button(c.is_hidden ? 'Restaurer' : 'Masquer', () =>
              form(details, 'Modérer cet avis', [reason], async (data, req) => {
                await read(
                  client,
                  'review_visibility',
                  c.order_id,
                  { ...data, hidden: !c.is_hidden },
                  0,
                  req,
                );
                await reload();
              }),
            ),
            c.merchant,
            c.courier,
            c.customer,
            c.merchant_stars,
            c.courier_stars,
            c.comment,
            date(c.created_at),
            c.is_hidden ? 'Masqué' : 'Visible',
          ]);
        } else if (tab === 'loyalty') {
          headers = [
            'Actions',
            'Client',
            'E-mail',
            'Commerce',
            'Progression / 9',
            'Récompenses',
            'Utilisées',
          ];
          rows = r.rows.map((c) => [
            button('Ajuster', () =>
              form(
                details,
                'Ajuster les récompenses disponibles',
                [
                  {
                    name: 'delta',
                    label: 'Variation (de -10 à +10, hors 0)',
                    type: 'number',
                    min: -10,
                    max: 10,
                  },
                  reason,
                ],
                async (data, req) => {
                  await read(
                    client,
                    'loyalty_adjust',
                    c.user_id,
                    { ...data, merchant_id: c.merchant_id },
                    0,
                    req,
                  );
                  await reload();
                },
              ),
            ),
            c.customer,
            c.email,
            c.merchant,
            c.paid_menus_count,
            c.rewards_available,
            c.rewards_redeemed,
          ]);
        } else if (tab === 'disputes') {
          headers = [
            'Actions',
            'Objet',
            'Commande',
            'Client',
            'État',
            'Description',
            'Conclusion',
            'Mis à jour',
          ];
          rows = r.rows.map((c) => [
            button('Traiter', () => caseForm(details, client, reload, c)),
            c.subject,
            c.order_id,
            c.customer_id,
            statuses[c.status],
            c.description,
            c.resolution,
            date(c.updated_at),
          ]);
        } else if (tab === 'communications') {
          headers = ['Actions', 'Destinataire', 'Objet', 'Message', 'État', 'Relance prévue'];
          rows = r.rows.map((c) => {
            const b = $('div');
            b.append(emailLink(c.email, c.subject, c.body));
            if (c.phone) {
              const a = $('a', 'Appeler');
              a.href = 'tel:' + c.phone.replace(/[^0-9+]/g, '');
              b.append(a);
            }
            if (c.status !== 'done')
              b.append(
                button('Marquer traité', () =>
                  form(details, 'Clôturer le suivi', [reason], async (data, req) => {
                    await read(client, 'contact_done', c.id, data, 0, req);
                    await reload();
                  }),
                ),
              );
            return [b, c.email, c.subject, c.body, statuses[c.status], date(c.due_at)];
          });
        } else if (tab === 'offers') {
          headers = [
            'Actions',
            'Offre',
            'Commerce',
            'Ville',
            'Carte',
            'Réduction',
            'Début',
            'Fin',
            'État',
          ];
          rows = r.rows.map((c) => {
            const map = $('a', 'Voir sur la carte');
            map.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(c.latitude)}&mlon=${encodeURIComponent(c.longitude)}#map=15/${encodeURIComponent(c.latitude)}/${encodeURIComponent(c.longitude)}`;
            map.target = '_blank';
            map.rel = 'noopener noreferrer';
            return [
              button(c.is_active ? 'Désactiver' : 'Activer', () =>
                form(details, 'Changer l’état de l’offre', [reason], async (data, req) => {
                  await read(
                    client,
                    'offer_toggle',
                    c.id,
                    { ...data, active: !c.is_active },
                    0,
                    req,
                  );
                  await reload();
                }),
              ),
              c.name,
              c.merchant,
              c.city,
              map,
              c.percent_off ? `${c.percent_off} %` : 'Prix par produit',
              c.starts_on,
              c.ends_on,
              c.is_active ? 'Active' : 'Inactive',
            ];
          });
        } else {
          headers = ['Date', 'Action', 'Type', 'Cible', 'Administrateur', 'Motif'];
          rows = r.rows.map((c) => [
            date(c.created_at),
            c.action,
            c.target_type,
            c.target_id,
            c.actor_user_id,
            c.details?.reason,
          ]);
        }
        region.replaceChildren($('p', `${r.total} enregistrement(s)`));
        if (rows.length) region.append(table(headers, rows));
        else region.append($('p', 'Aucun enregistrement.'));
        const nav = $('div');
        nav.className = 'pagination';
        const prev = button('Précédent', () => load(n - 1)),
          next = button('Suivant', () => load(n + 1));
        prev.disabled = n === 0;
        next.disabled = (n + 1) * 25 >= r.total;
        nav.append(prev, $('span', `Page ${n + 1}`), next);
        region.append(nav);
      } catch (error) {
        if (fresh() && current === version)
          region.replaceChildren($('p', 'Lecture impossible : ' + error.message));
      }
    }
    await load(0);
  }
  globalThis.ZEEROO_CRM = { render, actions, addEntity, form, read, contactForm };
})();
