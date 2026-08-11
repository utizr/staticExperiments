
// Place the helper function right above prerenderMap
function drawCitySettlementColonial(ctx, hexCenterX, hexCenterY) {
  ctx.save();

  const scale = 0.75;
  const yOffset = 4;
  ctx.translate(hexCenterX, hexCenterY + yOffset);
  ctx.scale(scale, scale);

  // Global styling
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2c3e50';
  ctx.lineJoin = 'round';

  // --- HELPER: Draw Arched Doors/Windows ---
  function drawArch(x, y, radius, dropHeight) {
    ctx.beginPath();
    ctx.arc(x, y, radius, Math.PI, 0);
    ctx.lineTo(x + radius, y + dropHeight);
    ctx.lineTo(x - radius, y + dropHeight);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------
  // 1. LEFT BUILDING: Rounded Stone Watchtower
  // ---------------------------------------------------
  // Tower base
  ctx.fillStyle = '#bdc3c7'; // Stone grey
  ctx.fillRect(-26, -5, 16, 20);
  ctx.strokeRect(-26, -5, 16, 20);

  // Tower Dome Roof
  ctx.fillStyle = '#c0392b'; // Dark red
  ctx.beginPath();
  ctx.arc(-18, -5, 8, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Arched tower window
  ctx.fillStyle = '#2c3e50';
  drawArch(-18, 5, 3, 5);

  // ---------------------------------------------------
  // 2. RIGHT BUILDING: Hacienda / Trade Arcade
  // ---------------------------------------------------
  // Hacienda base
  ctx.fillStyle = '#ecf0f1'; // Whitewash
  ctx.fillRect(10, -2, 18, 17);
  ctx.strokeRect(10, -2, 18, 17);

  // Curved Spanish Mission-style Roof
  ctx.fillStyle = '#e67e22'; // Orange/Terracotta
  ctx.beginPath();
  ctx.moveTo(10, -2);
  ctx.quadraticCurveTo(19, -15, 28, -2); // Smooth curved roofline
  ctx.fill();
  ctx.stroke();

  // Double arched doorways
  ctx.fillStyle = '#2c3e50';
  drawArch(14.5, 9, 3, 6);
  drawArch(23.5, 9, 3, 6);

  // ---------------------------------------------------
  // 3. CENTER BUILDING: Grand Governor's Palace / Cathedral
  // (Drawn last so it overlaps the side buildings)
  // ---------------------------------------------------
  // Main hall base
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(-14, -15, 28, 30);
  ctx.strokeRect(-14, -15, 28, 30);

  // Grand Central Dome
  ctx.fillStyle = '#d35400'; // Warm terracotta
  ctx.beginPath();
  ctx.arc(0, -15, 14, Math.PI, 0);
  ctx.fill();
  ctx.stroke();

  // Small cupola on top of the dome
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(-3, -34, 6, 5);
  ctx.strokeRect(-3, -34, 6, 5);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(0, -34, 3, Math.PI, 0); // Tiny dome on top
  ctx.fill();
  ctx.stroke();

  // Grand arched main entrance
  ctx.fillStyle = '#2c3e50';
  drawArch(0, 3, 6, 12);

  // Circular "Rose Window" above the door
  ctx.beginPath();
  ctx.arc(0, -6, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Place the helper function right above prerenderMap
function drawCitySettlementBastion(ctx, hexCenterX, hexCenterY) {
  ctx.save();

  const scale = 0.75;
  const yOffset = 4;
  ctx.translate(hexCenterX, hexCenterY + yOffset);
  ctx.scale(scale, scale);

  // Global styling
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2c3e50';
  ctx.lineJoin = 'round';

  // ---------------------------------------------------
  // 1. The Inner Citadel (The Keep)
  // Drawn first so it sits behind the outer walls
  // ---------------------------------------------------
  ctx.fillStyle = '#bdc3c7'; // Lighter stone
  ctx.fillRect(-12, -35, 24, 30);
  ctx.strokeRect(-12, -35, 24, 30);

  // Citadel Roof
  ctx.fillStyle = '#c0392b'; // Dark red roof
  ctx.beginPath();
  ctx.moveTo(-15, -35);
  ctx.lineTo(0, -48);
  ctx.lineTo(15, -35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ---------------------------------------------------
  // 2. Sloped Outer Bastions (Star Fort Walls)
  // ---------------------------------------------------
  ctx.fillStyle = '#95a5a6'; // Darker, heavy defensive stone

  // Left Bastion
  ctx.beginPath();
  ctx.moveTo(-32, 10);
  ctx.lineTo(-10, 10);
  ctx.lineTo(-4, -12); // Slopes inward as it goes up
  ctx.lineTo(-24, -18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right Bastion
  ctx.beginPath();
  ctx.moveTo(32, 10);
  ctx.lineTo(10, 10);
  ctx.lineTo(4, -12); // Slopes inward as it goes up
  ctx.lineTo(24, -18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ---------------------------------------------------
  // 3. Central Gatehouse & Portcullis
  // ---------------------------------------------------
  ctx.fillStyle = '#7f8c8d'; // Darkest stone for depth
  ctx.fillRect(-10, -2, 20, 12);
  ctx.strokeRect(-10, -2, 20, 12);

  // Dark opening for the gate
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.arc(0, 4, 6, Math.PI, 0);
  ctx.lineTo(6, 10);
  ctx.lineTo(-6, 10);
  ctx.closePath();
  ctx.fill();

  // Iron vertical gate bars
  ctx.strokeStyle = '#95a5a6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3, -2); ctx.lineTo(-3, 10);
  ctx.moveTo(0, -2); ctx.lineTo(0, 10);
  ctx.moveTo(3, -2); ctx.lineTo(3, 10);
  ctx.stroke();

  // ---------------------------------------------------
  // 4. Military Details
  // ---------------------------------------------------
  // Cannon Embrasures (Dark squares on the bastions)
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(-22, -8, 4, 4);
  ctx.fillRect(-14, -4, 4, 4);
  ctx.fillRect(18, -8, 4, 4);
  ctx.fillRect(10, -4, 4, 4);

  // Flagpole & Flag on the Citadel
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(0, -60);
  ctx.stroke();

  ctx.fillStyle = '#f1c40f'; // Spanish Gold/Yellow flag
  ctx.beginPath();
  ctx.moveTo(0, -60);
  ctx.lineTo(12, -56);
  ctx.lineTo(0, -52);
  ctx.fill();

  ctx.restore();
}
