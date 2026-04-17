import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Props {
  lat: number;
  lng: number;
  direccion?: string;
  height?: number;
}

function AutoPanTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function MiniMapaCliente({ lat, lng, direccion, height = 180 }: Props) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-200 mt-2"
      style={{ height: `${height}px` }}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        dragging={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]}>
          {direccion && <Popup>{direccion}</Popup>}
        </Marker>
        <AutoPanTo lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}
