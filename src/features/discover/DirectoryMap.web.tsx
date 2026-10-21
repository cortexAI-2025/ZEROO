import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { env } from '@/lib/env';

import type { DirectoryMapProps } from './DirectoryMap';

export const MAP_SUPPORTED = true;

const OPEN = '#2e7d32';
const CLOSED = '#757575';
const SELECTED = '#e65100';

/**
 * Carte de l'annuaire (web) : un repère par établissement qui accueille le public. Une dark
 * kitchen n'a pas de position précise (`latitude` nulle) et n'apparaît donc pas ici.
 */
export function DirectoryMap({ merchants, center, selectedSlug, onSelect }: DirectoryMapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = L.map(container.current, { zoomControl: true }).setView([46.6, 2.4], 5);
    L.tileLayer(env.mapTilesUrl, {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const m of merchants) {
      const point: L.LatLngTuple = [m.latitude, m.longitude];
      points.push(point);
      const selected = m.slug === selectedSlug;
      L.circleMarker(point, {
        radius: selected ? 12 : 9,
        color: '#ffffff',
        weight: 2,
        fillColor: selected ? SELECTED : m.is_accepting_orders ? OPEN : CLOSED,
        fillOpacity: 0.95,
      })
        .bindTooltip(m.name)
        .on('click', () => onSelectRef.current(m.slug))
        .addTo(layer.current);
    }
    if (center) {
      L.circle([center.latitude, center.longitude], {
        radius: 40,
        color: '#1565c0',
        fillColor: '#1565c0',
        fillOpacity: 0.6,
        interactive: false,
      }).addTo(layer.current);
      points.push([center.latitude, center.longitude]);
    }
    if (points.length > 0)
      map.current.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });
  }, [merchants, center, selectedSlug]);

  return (
    <div
      ref={container}
      role="application"
      aria-label="Carte des établissements"
      style={{ height: 360, width: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}
