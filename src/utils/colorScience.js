// CIEDE2000 adapted from yourlin/Fusible-Beads-Studio (MIT).
// Copyright (c) 2026 yourlin. See licenses/Fusible-Beads-Studio-MIT.txt.
const deg2rad = (deg) => deg * Math.PI / 180;
const rad2deg = (rad) => rad * 180 / Math.PI;
function hueAngle(b, ap) {
  if (b === 0 && ap === 0)
    return 0;
  let h = rad2deg(Math.atan2(b, ap));
  if (h < 0)
    h += 360;
  return h;
}
function ciede2000(lab1, lab2) {
  const kL = 1;
  const kC = 1;
  const kH = 1;
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180)
      dhp = diff;
    else if (diff > 180)
      dhp = diff - 360;
    else
      dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp) / 2);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos(deg2rad(hbarp - 30)) + 0.24 * Math.cos(deg2rad(2 * hbarp)) + 0.32 * Math.cos(deg2rad(3 * hbarp + 6)) - 0.2 * Math.cos(deg2rad(4 * hbarp - 63));
  const dtheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lbarp - 50, 2) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(deg2rad(2 * dtheta)) * Rc;
  return Math.sqrt(
    Math.pow(dLp / (kL * Sl), 2) + Math.pow(dCp / (kC * Sc), 2) + Math.pow(dHp / (kH * Sh), 2) + Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
  );
}
export {
  ciede2000
};
