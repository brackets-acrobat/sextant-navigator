/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// planchette.js — la feuille de position.
//
// Le navigateur ne trace pas sur sa carte : il trace sur une feuille blanche,
// centrée sur son estime, graduée en milles. Au-dessus de l'océan la carte n'a
// rien à montrer, et surtout l'échelle utile n'est pas la sienne — un intercept
// fait quelques milles, une carte en couvre mille. Le point trouvé, lui, se
// reporte ensuite sur la carte : c'est le partage historique du travail.
//
// CINQ CHOSES, ET RIEN D'AUTRE : l'estime au centre, les droites de hauteur
// avec le nom de leur astre, le chapeau, le point, l'échelle. Tout le reste —
// la course, le tracé sans transport, les azimuts de construction — a été
// essayé puis retiré : la feuille doit se comprendre en dix secondes.
//
// AUCUN CALCUL ICI. La mise en feuille est au noyau (`plotSheet`), montée par
// `main/reduction.js` en même temps que le point. Ce fichier reçoit des
// coordonnées en milles et les peint. La séparation tient au projet : le jour
// où l'on voudra tracer à la main, au rapporteur, c'est la couche du noyau
// qu'on gardera et celle-ci qu'on refera.
// ============================================================

// Le repère de la feuille compte y vers le NORD, l'écran le compte vers le bas.
// Le retournement se fait dans `projeter`, une seule fois, et nulle part
// ailleurs — c'est la faute qui, sinon, se glisse dans un tracé sur trois.
function planchetteProjeter(feuille, cote) {
  var demi = cote / 2;
  var k = demi / feuille.halfSpanNm;
  return {
    k: k,
    p: function (pt) { return [demi + pt.x * k, demi - pt.y * k]; },
  };
}

function planchetteTrait(a, b, style) {
  return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1)
    + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" ' + style + '/>';
}

/**
 * Où écrire le nom d'un astre : au BOUT de sa droite.
 *
 * Près du point les droites se rejoignent par construction, et trois étiquettes
 * s'y marchent dessus — c'est le premier défaut qu'on a vu à l'écran. Au bord
 * de la feuille elles sont au plus écarté, et c'est aussi là qu'un navigateur
 * annote la sienne.
 *
 * On teste la BOÎTE du texte, pas son ancre : le nom est centré et couché sur
 * la droite, si bien que son point d'ancrage peut être largement dans la
 * feuille pendant que la moitié du mot en sort. Deuxième défaut vu à l'écran.
 */
function planchetteEtiquette(a, b, angle, nom, cote, autres) {
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  var L = Math.hypot(dx, dy);
  if (L < 1) return null;

  // La portion de la droite qui tombe dans la feuille.
  var t0 = 0;
  var t1 = 1;
  [[a[0], dx], [a[1], dy]].forEach(function (axe) {
    if (Math.abs(axe[1]) < 1e-9) return;
    var u = (0 - axe[0]) / axe[1];
    var v = (cote - axe[0]) / axe[1];
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
  });
  if (t1 <= t0) return null;

  var rad = (angle * Math.PI) / 180;
  var ca = Math.cos(rad);
  var sa = Math.sin(rad);
  // Demi-largeur estimée large : un caractère de cette fonte condensée à
  // 12,5 px en fait moins de six, et le contour ajoute deux.
  var demiL = 3.4 * nom.length + 5;
  var tient = function (p) {
    for (var sx = -1; sx <= 1; sx += 2) {
      for (var sy = 0; sy <= 1; sy += 1) {
        var lx = sx * demiL;
        var ly = sy === 0 ? -19 : 1;
        var cx = p[0] + lx * ca - ly * sa;
        var cy = p[1] + lx * sa + ly * ca;
        if (cx < 4 || cx > cote - 4 || cy < 4 || cy > cote - 4) return false;
      }
    }
    return true;
  };

  // On rentre depuis chaque bout, par pas de six pixels, jusqu'à ce que le mot
  // entier tienne sur la feuille.
  var pas = 6 / L;
  var candidats = [];
  [[t1, -1], [t0, 1]].forEach(function (bout) {
    var t = bout[0];
    for (var n = 0; n < 300 && t >= t0 && t <= t1; n += 1) {
      var p = [a[0] + dx * t, a[1] + dy * t];
      if (tient(p)) { candidats.push(p); return; }
      t += bout[1] * pas;
    }
  });
  if (!candidats.length) {
    candidats = [[a[0] + dx * ((t0 + t1) / 2), a[1] + dy * ((t0 + t1) / 2)]];
  }

  // Des deux bouts, celui qui s'éloigne le plus des AUTRES droites.
  var meilleur = null;
  candidats.forEach(function (p) {
    var pire = Infinity;
    autres.forEach(function (s) {
      var ex = s[1][0] - s[0][0];
      var ey = s[1][1] - s[0][1];
      var d = Math.abs((p[0] - s[0][0]) * ey - (p[1] - s[0][1]) * ex) / Math.hypot(ex, ey);
      if (d < pire) pire = d;
    });
    if (!meilleur || pire > meilleur.ecart) meilleur = { p: p, ecart: pire };
  });
  return meilleur.p;
}

function dessinerPlanchette() {
  var panneau = $('planchette-panel');
  if (!panneau || panneau.hidden) return;

  var svg = $('planchette-feuille');
  var vide = $('planchette-vide');
  var resume = $('planchette-resume');
  var r = typeof _reduction !== 'undefined' ? _reduction : null;
  var feuille = r && r.ok ? r.planchette : null;

  // Rien à tracer : on dit quoi faire, on ne laisse pas une feuille blanche
  // sans explication.
  if (!feuille) {
    svg.innerHTML = '';
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    resume.textContent = '';
    vide.hidden = false;
    vide.textContent = t(r && r.ok && !r.point ? 'planchetteUneDroite' : 'planchetteVide');
    return;
  }
  vide.hidden = true;

  // La feuille est carrée : elle prend ce que la plus petite dimension permet,
  // parce que les deux axes portent la MÊME échelle en milles. Une feuille
  // étirée mentirait sur les distances.
  var scene = panneau.querySelector('.planchette-scene');
  var cote = Math.max(280, Math.min(scene.clientWidth, scene.clientHeight) - 28);
  svg.setAttribute('width', cote);
  svg.setAttribute('height', cote);
  svg.setAttribute('viewBox', '0 0 ' + cote + ' ' + cote);

  var P = planchetteProjeter(feuille, cote);
  var out = '<rect width="' + cote + '" height="' + cote + '" fill="#fbfaf6"/>';

  // Le chapeau : le triangle où les droites se coupent. En gris pâle — il n'est
  // pas le résultat, il est ce qui reste d'incertitude autour.
  var h = feuille.chapeau;
  if (h && h.vertices.length >= 3) {
    var pts = h.vertices.map(P.p);
    var cx = pts.reduce(function (s, p) { return s + p[0]; }, 0) / pts.length;
    var cy = pts.reduce(function (s, p) { return s + p[1]; }, 0) / pts.length;
    pts.sort(function (a, b) {
      return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
    });
    out += '<polygon points="' + pts.map(function (p) {
      return p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }).join(' ') + '" fill="#e4e0d4" stroke="#a8a294" stroke-width="1"/>';
  }

  // Les droites, de bord à bord : une droite de hauteur n'a pas d'extrémités,
  // et la tronquer laisserait chercher un croisement hors du trait.
  var segments = feuille.droites.map(function (d) { return [P.p(d.a), P.p(d.b)]; });
  segments.forEach(function (s) {
    out += planchetteTrait(s[0], s[1], 'stroke="#2b3440" stroke-width="1.6" stroke-linecap="round"');
  });

  feuille.droites.forEach(function (d, i) {
    var angle = (Math.atan2(-d.v.y, d.v.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    var autres = segments.filter(function (_, j) { return j !== i; });
    var p = planchetteEtiquette(segments[i][0], segments[i][1], angle, d.body, cote, autres);
    if (!p) return;
    // Contour couleur papier : si une droite passe malgré tout dessous, le nom
    // reste lisible.
    out += '<g transform="translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1)
      + ') rotate(' + angle.toFixed(1) + ')">'
      + '<text y="-6" text-anchor="middle" font-family="Segoe UI, Tahoma, sans-serif"'
      + ' font-size="12.5" fill="#2b3440" stroke="#fbfaf6" stroke-width="3.5"'
      + ' paint-order="stroke" stroke-linejoin="round">' + escapeHtml(nomAstre(d.body)) + '</text></g>';
  });

  // L'estime : le carré, ce qu'on SUPPOSE. Le rond du point lui répond — c'est
  // la convention de carte, et elle sépare d'un coup d'œil ce qu'on a mesuré de
  // ce qu'on a cru.
  var demi = cote / 2;
  out += '<rect x="' + (demi - 5) + '" y="' + (demi - 5) + '" width="10" height="10"'
    + ' fill="none" stroke="#2b3440" stroke-width="1.6"/>'
    + '<text x="' + (demi + 12) + '" y="' + (demi + 15) + '"'
    + ' font-family="Segoe UI, Tahoma, sans-serif" font-size="12" fill="#2b3440">'
    + escapeHtml(t('planchetteEstime')) + '</text>';

  // Le point : seule tache de couleur de la feuille.
  if (feuille.point) {
    var pp = P.p(feuille.point);
    out += '<circle cx="' + pp[0].toFixed(1) + '" cy="' + pp[1].toFixed(1) + '" r="7"'
      + ' fill="none" stroke="#1d4ed8" stroke-width="1.8"/>'
      + '<circle cx="' + pp[0].toFixed(1) + '" cy="' + pp[1].toFixed(1) + '" r="1.8" fill="#1d4ed8"/>'
      + '<text x="' + (pp[0] + 11).toFixed(1) + '" y="' + (pp[1] - 8).toFixed(1) + '"'
      + ' font-family="Segoe UI, Tahoma, sans-serif" font-size="12.5" font-weight="600"'
      + ' fill="#1d4ed8">' + escapeHtml(t('planchettePoint')) + '</text>';
  }

  // L'échelle. Sans elle aucune longueur ne veut rien dire, donc elle ne se
  // règle pas et ne se masque pas.
  var lg = feuille.stepNm * P.k;
  var x0 = 18;
  var y0 = cote - 22;
  out += planchetteTrait([x0, y0], [x0 + lg, y0], 'stroke="#6b6659" stroke-width="1.5"')
    + planchetteTrait([x0, y0 - 4], [x0, y0 + 4], 'stroke="#6b6659" stroke-width="1.5"')
    + planchetteTrait([x0 + lg, y0 - 4], [x0 + lg, y0 + 4], 'stroke="#6b6659" stroke-width="1.5"')
    + '<text x="' + (x0 + lg + 7) + '" y="' + (y0 + 4) + '" font-family="monospace"'
    + ' font-size="11" fill="#6b6659">' + feuille.stepNm + ' NM</text>';

  out += '<rect x=".5" y=".5" width="' + (cote - 1) + '" height="' + (cote - 1)
    + '" fill="none" stroke="#d8d2c4"/>';
  svg.innerHTML = out;

  resume.textContent = t('planchetteResume')
    .replace('{nm}', feuille.correction.nm.toFixed(1))
    .replace('{rel}', String(Math.round(feuille.correction.bearing) % 360).padStart(3, '0'));
}

// Ré-étiquetage à la bascule FR / EN.
function renderPlanchette() { dessinerPlanchette(); }

// --- Branchements ------------------------------------------------------------

function ouvrirFermerPlanchette(ouvrir) {
  $('planchette-panel').hidden = !ouvrir;
  $('btn-planchette').classList.toggle('is-active', ouvrir);
  document.querySelector('main').classList.toggle('planchette-open', ouvrir);
  // La feuille prend toute la carte : le carnet et le plan de vol se referment,
  // sinon elle n'aurait plus la place d'être carrée.
  if (ouvrir) {
    if (!$('visees-panel').hidden) ouvrirFermerVisees(false);
    if (!$('legs-panel').hidden) ouvrirFermerLegs(false);
    dessinerPlanchette();
  }
}

$('btn-planchette').addEventListener('click', async function () {
  // Le point n'a pas encore été fait : on le fait. C'est la suite évidente du
  // geste, et obliger à presser deux boutons dans le bon ordre pour voir son
  // travail serait une devinette de plus.
  if (typeof _reduction === 'undefined' || !_reduction) await faireLePoint();
  ouvrirFermerPlanchette(true);
});

$('planchette-close').addEventListener('click', function () { ouvrirFermerPlanchette(false); });

// La feuille est carrée et se redimensionne avec la fenêtre : elle se redessine
// à la taille, sinon l'échelle en milles deviendrait fausse.
window.addEventListener('resize', function () { dessinerPlanchette(); });
