import React, { useRef, useEffect, useState } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { MapContainer, TileLayer, Marker as LeafletMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MapTypeToggle from './MapTypeToggle';
import { MapMarkers, createIconFromSvg } from './IconLibrary';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '',
  iconUrl: '',
  shadowUrl: '',
});

const blueIcon = createIconFromSvg(MapMarkers.blue(false));
const redIcon = createIconFromSvg(MapMarkers.red(true));

const defaultCenter = { lat: 39.5, lng: 35.0 };
const defaultZoom = 6;

const ChangeMapView = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center && map) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
};

const OSMClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
        const { lat, lng } = e.latlng;
        if (onMapClick) onMapClick(lat, lng);
      }
    },
  });
  return null;
};

const OSMSearchControl = () => {
  const map = useMap();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        map.setView([lat, lon], 14);
      } else {
        alert('Ничего не найдено');
      }
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  };

  return (
    <div style={{ position: 'absolute', top: '10px', left: '50px', zIndex: 1000, background: 'white', padding: '5px', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', display: 'flex' }}>
      <input type="text" placeholder="Поиск на OSM..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} style={{ padding: '6px', width: '180px', fontSize: '14px' }} />
      <button onClick={handleSearch} style={{ marginLeft: '5px', padding: '6px 10px' }}>🔍</button>
    </div>
  );
};

const OSMLayerControl = ({ onLayerChange }) => {
  const [layer, setLayer] = useState('street');
  const changeLayer = (newLayer) => { setLayer(newLayer); if (onLayerChange) onLayerChange(newLayer); };
  return (
    <div style={{ position: 'absolute', top: '60px', left: '50px', zIndex: 1000, background: 'white', padding: '8px', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', display: 'flex', gap: '8px' }}>
      <button onClick={() => changeLayer('street')} style={{ padding: '6px 12px', fontSize: '14px', background: layer === 'street' ? '#2ecc71' : '#ddd', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗺️ Карта</button>
      <button onClick={() => changeLayer('satellite')} style={{ padding: '6px 12px', fontSize: '14px', background: layer === 'satellite' ? '#2ecc71' : '#ddd', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🛰️ Спутник</button>
    </div>
  );
};

const GoogleSearchBox = ({ map }) => {
  const [searchBox, setSearchBox] = useState(null);
  useEffect(() => {
    if (!map || searchBox) return;
    if (window.google && window.google.maps && window.google.maps.places) {
      const input = document.createElement('input');
      input.placeholder = 'Поиск на Google Maps...';
      input.style.cssText = `position: absolute; top: 10px; left: 50px; z-index: 10; width: 200px; padding: 6px; font-size: 14px; border-radius: 4px; border: 1px solid #ccc; background: white;`;
      const container = document.getElementById('google-map-container');
      if (container) container.appendChild(input);
      const sb = new window.google.maps.places.SearchBox(input);
      sb.addListener('places_changed', () => {
        const places = sb.getPlaces();
        if (places && places.length > 0) {
          const bounds = new window.google.maps.LatLngBounds();
          places.forEach(place => bounds.extend(place.geometry.location));
          map.fitBounds(bounds);
        }
      });
      setSearchBox(sb);
    }
  }, [map, searchBox]);
  return null;
};

const CustomGoogleMarker = ({ position, onClick, isHighlighted }) => {
  const markerColor = isHighlighted ? '#ff0000' : '#4285F4';
  return (
    <Marker
      position={position}
      onClick={onClick}
      icon={{
        path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
        fillColor: markerColor,
        fillOpacity: 0.8,
        strokeWeight: 1,
        strokeColor: '#ffffff',
        scale: 1.2,
        anchor: { x: 12, y: 12 }
      }}
    />
  );
};

const MapView = ({ points, onMapClick, highlightedPoint, onMarkerClick }) => {
  const leafletMapRef = useRef(null);
  const googleMapRef = useRef(null);
  const [osmLayer, setOsmLayer] = useState('street');
  const [mapType, setMapType] = useState('osm');

  const getTileUrl = () => osmLayer === 'street' ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const getAttribution = () => osmLayer === 'street' ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' : 'Tiles &copy; Esri';

  const highlightedPointData = points.find(p => p.guid === highlightedPoint);
  const centerLat = highlightedPointData?.latitude;
  const centerLng = highlightedPointData?.longitude;

  useEffect(() => {
    if (mapType === 'google' && googleMapRef.current && centerLat && centerLng) {
      googleMapRef.current.panTo({ lat: centerLat, lng: centerLng });
      googleMapRef.current.setZoom(12);
    }
  }, [centerLat, centerLng, mapType]);

  const handleGoogleClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      onMapClick(e.latLng.lat(), e.latLng.lng());
    }
  };

  const renderOsmMarkers = () => points.filter(p => p.latitude && p.longitude).map(p => {
    const isHighlighted = p.guid === highlightedPoint;
    const icon = isHighlighted ? redIcon : blueIcon;
    return (
      <LeafletMarker key={p.guid} position={[p.latitude, p.longitude]} icon={icon} eventHandlers={{ click: () => onMarkerClick(p.guid) }}>
        <Popup>
          <strong>{p.location_original?.substring(0, 80)}</strong><br />
          {p.display_date}<br />
          {p.collectors?.map(c => c.display_name).join(', ')}
        </Popup>
      </LeafletMarker>
    );
  });

  const renderGoogleMarkers = () => points.filter(p => p.latitude && p.longitude).map(p => (
    <CustomGoogleMarker key={p.guid} position={{ lat: p.latitude, lng: p.longitude }} onClick={() => onMarkerClick(p.guid)} isHighlighted={p.guid === highlightedPoint} />
  ));

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapTypeToggle mapType={mapType} onMapTypeChange={setMapType} />
      {mapType === 'osm' && (
        <MapContainer center={defaultCenter} zoom={defaultZoom} style={{ height: '100%', width: '100%' }} whenReady={(map) => { leafletMapRef.current = map.target; }}>
          <TileLayer url={getTileUrl()} attribution={getAttribution()} />
          {renderOsmMarkers()}
          <ChangeMapView center={centerLat && centerLng ? [centerLat, centerLng] : null} zoom={12} />
          <OSMClickHandler onMapClick={onMapClick} />
          <OSMSearchControl />
          <OSMLayerControl onLayerChange={setOsmLayer} />
        </MapContainer>
      )}
      {mapType === 'google' && (
        <div id="google-map-container" style={{ height: '100%', width: '100%' }}>
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={centerLat && centerLng ? { lat: centerLat, lng: centerLng } : defaultCenter} zoom={centerLat && centerLng ? 12 : defaultZoom} onClick={handleGoogleClick} onLoad={(map) => { googleMapRef.current = map; }}>
            {renderGoogleMarkers()}
            <GoogleSearchBox map={googleMapRef.current} />
          </GoogleMap>
        </div>
      )}
    </div>
  );
};

export default MapView;
