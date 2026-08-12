import './style.css';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cogProtocol } from '@geomatico/maplibre-cog-protocol';

// Register the COG protocol
maplibregl.addProtocol('cog', cogProtocol);

// Bounding box roughly corresponding to a region (e.g. California Central Valley)
const bbox = [-122.2, 38.0, -121.8, 38.4];
const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];

const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {},
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: {
                    'background-color': '#f8f4f0'
                }
            }
        ]
    },
    center: center as [number, number],
    zoom: 8
});

async function fetchStacAndAddLayer() {
    try {
        const response = await fetch('https://earth-search.aws.element84.com/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                collections: ['sentinel-2-c1-l2a'],
                bbox: bbox,
                datetime: '2024-05-01T00:00:00Z/2024-06-01T00:00:00Z',
                query: {
                    'eo:cloud_cover': { lt: 5 }
                },
                limit: 1
            })
        });

        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const item = data.features[0];
            const visualCogUrl = item.assets.visual.href;

            map.addSource('sentinel-2-visual', {
                type: 'raster',
                url: `cog://${visualCogUrl}`,
                tileSize: 256
            });

            map.addLayer({
                id: 'sentinel-2-visual-layer',
                type: 'raster',
                source: 'sentinel-2-visual',
                paint: {
                    'raster-opacity': 1.0,
                    'raster-fade-duration': 0
                }
            });
        } else {
            console.warn('No STAC items found for the given criteria.');
        }
    } catch (error) {
        console.error('Failed to fetch STAC metadata:', error);
    }
}

map.on('load', () => {
    fetchStacAndAddLayer();
});
