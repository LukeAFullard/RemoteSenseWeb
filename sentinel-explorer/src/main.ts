import './style.css';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cogProtocol } from '@geomatico/maplibre-cog-protocol';
import proj4 from 'proj4';
import { fromUrl } from 'geotiff';

// Register the COG protocol
maplibregl.addProtocol('cog', cogProtocol);

// Bounding box roughly corresponding to a region (e.g. California Central Valley)
const bbox = [-122.2, 38.0, -121.8, 38.4];
const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];

// Small test AOI for raster extraction within the main bbox
const testAoiBbox = [-122.05, 38.15, -121.95, 38.25];

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
            const redCogUrl = item.assets.red.href;
            const nirCogUrl = item.assets.nir08?.href || item.assets.nir?.href;
            const epsgCode = item.properties['proj:epsg'];

            console.log('Discovered Red COG URL:', redCogUrl);
            console.log('Discovered NIR COG URL:', nirCogUrl);
            console.log('Discovered EPSG Code:', epsgCode);

            // Setup proj4 for coordinate transformation
            // We know the source is WGS84 (EPSG:4326)
            // We need to dynamically construct the UTM projection for the destination
            const isNorth = epsgCode >= 32600 && epsgCode <= 32660;
            const utmZone = isNorth ? epsgCode - 32600 : epsgCode - 32700;
            const utmProjString = `+proj=utm +zone=${utmZone} ${isNorth ? '+north' : '+south'} +datum=WGS84 +units=m +no_defs`;
            proj4.defs(`EPSG:${epsgCode}`, utmProjString);

            // Transform the test AOI bbox to the UTM CRS
            const minLonLat = [testAoiBbox[0], testAoiBbox[1]];
            const maxLonLat = [testAoiBbox[2], testAoiBbox[3]];
            const minUtm = proj4('EPSG:4326', `EPSG:${epsgCode}`, minLonLat);
            const maxUtm = proj4('EPSG:4326', `EPSG:${epsgCode}`, maxLonLat);

            const testAoiUtmBbox = [
                Math.min(minUtm[0], maxUtm[0]),
                Math.min(minUtm[1], maxUtm[1]),
                Math.max(minUtm[0], maxUtm[0]),
                Math.max(minUtm[1], maxUtm[1])
            ];

            console.log('Test AOI Bbox (WGS84):', testAoiBbox);
            console.log(`Test AOI Bbox (UTM EPSG:${epsgCode}):`, testAoiUtmBbox);

            // Raster Window Calculation & Extraction for B04 (Red) and B08 (NIR)
            if (redCogUrl && nirCogUrl) {
                try {
                    // Initialize GeoTIFFs from URLs
                    const redTiff = await fromUrl(redCogUrl);
                    const redImage = await redTiff.getImage();

                    const nirTiff = await fromUrl(nirCogUrl);
                    const nirImage = await nirTiff.getImage();

                    // Assuming both Red and NIR are on the same 10m grid, we can use Red's metadata for window calculation.
                    // Get bounding box and pixel dimensions from the red image metadata
                    const imageBbox = redImage.getBoundingBox();
                    const imageWidth = redImage.getWidth();
                    const imageHeight = redImage.getHeight();

                    // Calculate pixel resolution
                    const pixelWidth = (imageBbox[2] - imageBbox[0]) / imageWidth;
                    const pixelHeight = (imageBbox[3] - imageBbox[1]) / imageHeight;

                    console.log('GeoTIFF Metadata (Red):', {
                        bbox: imageBbox,
                        width: imageWidth,
                        height: imageHeight,
                        pixelWidth: pixelWidth,
                        pixelHeight: pixelHeight
                    });

                    // Calculate the window in pixel coordinates
                    // Math.floor/Math.ceil to ensure we cover the entire AOI
                    let minX = Math.floor((testAoiUtmBbox[0] - imageBbox[0]) / pixelWidth);
                    let maxX = Math.ceil((testAoiUtmBbox[2] - imageBbox[0]) / pixelWidth);

                    // Note: GeoTIFF Y coordinates usually start from the top (max Y) and go down.
                    // So imageBbox[3] is the top, and pixelHeight is positive or negative depending on the implementation.
                    // In geotiff.js, getBoundingBox returns [minX, minY, maxX, maxY].
                    // The origin is usually at [minX, maxY].
                    let minY = Math.floor((imageBbox[3] - testAoiUtmBbox[3]) / pixelHeight);
                    let maxY = Math.ceil((imageBbox[3] - testAoiUtmBbox[1]) / pixelHeight);

                    // Clamp to image bounds
                    minX = Math.max(0, Math.min(minX, imageWidth));
                    maxX = Math.max(0, Math.min(maxX, imageWidth));
                    minY = Math.max(0, Math.min(minY, imageHeight));
                    maxY = Math.max(0, Math.min(maxY, imageHeight));

                    // Swap Y if they are inverted
                    if (minY > maxY) {
                        const temp = minY;
                        minY = maxY;
                        maxY = temp;
                    }

                    console.log('Calculated Raster Window (pixels):', { minX, minY, maxX, maxY });

                    if (minX < maxX && minY < maxY) {
                        // Extract the pixel values using HTTP Range Requests (handled by geotiff.js)
                        const window = [minX, minY, maxX, maxY];

                        const redRasterData = await redImage.readRasters({ window });
                        const nirRasterData = await nirImage.readRasters({ window });

                        console.log('Successfully extracted raster data!');
                        console.log('Sample pixels (Red B04):', redRasterData[0].slice(0, 10));
                        console.log('Sample pixels (NIR B08):', nirRasterData[0].slice(0, 10));

                        // Calculate NDVI
                        const redPixels = redRasterData[0] as Uint16Array | Float32Array;
                        const nirPixels = nirRasterData[0] as Uint16Array | Float32Array;

                        const numPixels = redPixels.length;
                        const ndviArray = new Float32Array(numPixels);

                        for (let i = 0; i < numPixels; i++) {
                            const red = redPixels[i];
                            const nir = nirPixels[i];

                            const denominator = nir + red;
                            if (denominator === 0) {
                                ndviArray[i] = NaN; // Handle division by zero / nodata
                            } else {
                                ndviArray[i] = (nir - red) / denominator;
                            }
                        }

                        // Calculate NDVI Statistics
                        let validCount = 0;
                        let sum = 0;
                        const validNdviValues: number[] = [];

                        for (let i = 0; i < ndviArray.length; i++) {
                            const val = ndviArray[i];
                            if (!Number.isNaN(val)) {
                                validCount++;
                                sum += val;
                                validNdviValues.push(val);
                            }
                        }

                        const mean = validCount > 0 ? sum / validCount : NaN;

                        let median = NaN;
                        if (validCount > 0) {
                            validNdviValues.sort((a, b) => a - b);
                            const mid = Math.floor(validCount / 2);
                            if (validCount % 2 === 0) {
                                median = (validNdviValues[mid - 1] + validNdviValues[mid]) / 2;
                            } else {
                                median = validNdviValues[mid];
                            }
                        }

                        console.log('NDVI Statistics:', {
                            validPixelCount: validCount,
                            mean: mean,
                            median: median
                        });
                        console.log('Sample pixels (NDVI):', Array.from(ndviArray.slice(0, 10)));
                    } else {
                        console.warn('The calculated raster window is empty or out of bounds.');
                    }
                } catch (rasterError) {
                    console.error('Failed to extract raster window:', rasterError);
                }
            }

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
