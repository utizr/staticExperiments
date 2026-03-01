const fs = require('fs').promises;
const path = require('path');

async function syncJsonFiles() {
  const sourcePath = path.join(__dirname, 'worldDetailed.geojson');
  const destinationPath = path.join(__dirname, 'worldProcessed.geojson');

  try {
    // 1. Read the file
    const rawData = await fs.readFile(sourcePath, 'utf8');

    const output = {
      "type": "FeatureCollection",
      "name": "ne_50m_admin_0_countries",
      "crs": {
        "type": "name",
        "properties": {
          "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
      },
      features: [],
      "bbox": [
        -180,
        -89.99892578125,
        180,
        83.599609375
      ]
    }
    // 2. Parse into a variable
    const jsonData = JSON.parse(rawData);

    jsonData.features.forEach(country => {
      const c = {
        type: "Feature",
        properties: {
          NAME: country.properties.ADMIN || country.properties.NAME,
        },
        bbox: country.bbox,
        geometry: country.geometry,
      };
      output.features.push(c);
    });

    // 3. Write to the new file
    // We use JSON.stringify to turn the object back into a string
    await fs.writeFile(destinationPath, JSON.stringify(output));

    console.log(`Successfully synced to ${destinationPath}`);
  } catch (error) {
    console.error('Error handling files:', error.message);
  }
}

syncJsonFiles();