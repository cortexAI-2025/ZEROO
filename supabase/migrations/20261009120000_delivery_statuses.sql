-- Étape (g) : statuts de livraison. Migration séparée : une valeur ajoutée à un enum
-- n'est utilisable qu'après la validation de la transaction qui l'ajoute.
alter type public.order_status add value if not exists 'out_for_delivery' after 'ready';  -- remise au livreur
alter type public.order_status add value if not exists 'delivered' after 'out_for_delivery';  -- remise au client par le livreur
