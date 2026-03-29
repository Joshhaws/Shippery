(function () {
  'use strict';

  var TILE = 32;
  var COLS = 168;
  var ROWS = 104;
  var VIEW_W = 640;
  var VIEW_H = 384;
  var WOOD_TO_REBUILD = 22;
  var GOLEM_HP = 78;
  var PLAYER_W = 24;
  var PLAYER_H = 24;

  var T_WATER = 0;
  var T_SAND = 1;
  var T_GRASS = 2;
  var T_DEBRIS = 3;
  var T_DESERT = 4;
  var T_MOUNTAIN = 5;
  var T_FINISH = 6;
  var TILE_GOAL = 7;

  var WEAPON_TYPES = ['stick', 'oar', 'axe', 'pickaxe', 'sword'];
  var FOOD_TYPES = ['berries', 'mushroom', 'fish', 'coconut'];

  var ITEM_META = {
    stick: { name: 'Stick', emoji: '🪵', stack: 99, type: 'weapon', dmg: 4, desc: 'A driftwood club. Better than nothing.' },
    oar: { name: 'Oar', emoji: '🚣', stack: 1, type: 'weapon', dmg: 6, desc: 'Heavy paddle. Good on land or deck.' },
    axe: { name: 'Axe', emoji: '🪓', stack: 1, type: 'weapon', dmg: 9, desc: 'Chops trees for wood.' },
    pickaxe: { name: 'Pickaxe', emoji: '⛏', stack: 1, type: 'weapon', dmg: 8, desc: 'Cracks golems and stone.' },
    sword: { name: 'Sword', emoji: '⚔', stack: 1, type: 'weapon', dmg: 12, desc: 'Sharp steel for beasts.' },
    wood: { name: 'Wood', emoji: '🪵', stack: 99, type: 'resource', desc: 'Camp fuel and hull timber.' },
    rock: { name: 'Rock', emoji: '🪨', stack: 99, type: 'resource', desc: 'For tools at the crafting mat.' },
    berries: { name: 'Berries', emoji: '🫐', stack: 20, type: 'food', heal: 8, desc: 'Sweet island berries.' },
    mushroom: { name: 'Mushroom', emoji: '🍄', stack: 20, type: 'food', heal: 6, desc: 'Rubbery but filling.' },
    fish: { name: 'Fish', emoji: '🐟', stack: 20, type: 'food', heal: 14, desc: 'Salty protein.' },
    coconut: { name: 'Coconut', emoji: '🥥', stack: 20, type: 'food', heal: 12, desc: 'Thick husk, good water.' },
  };

  var CRAFT_RECIPES = [
    { id: 'axe', title: 'Axe', needs: { wood: 4, rock: 1 }, out: { kind: 'axe', count: 1 } },
    { id: 'pickaxe', title: 'Pickaxe', needs: { wood: 3, rock: 2 }, out: { kind: 'pickaxe', count: 1 } },
    { id: 'sword', title: 'Sword', needs: { wood: 2, rock: 3 }, out: { kind: 'sword', count: 1 } },
  ];

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var toastEl = document.getElementById('toast');
  var hotbarEl = document.getElementById('hotbar');
  var craftOverlay = document.getElementById('crafting-overlay');
  var craftRecipesEl = document.getElementById('craft-recipes');
  var craftStockEl = document.getElementById('craft-stock');
  var winOverlay = document.getElementById('winOverlay');
  var equipSlotIcon = document.getElementById('equip-slot-icon');
  var equipTitle = document.getElementById('equip-title');
  var equipSubtitle = document.getElementById('equip-subtitle');
  var equipStats = document.getElementById('equip-stats');
  var equipDesc = document.getElementById('equip-desc');
  var equipHints = document.getElementById('equip-hints');
  var equipAttackLine = document.getElementById('equip-attack-line');
  var equipModeLine = document.getElementById('equip-mode-line');

  var world = new Uint8Array(COLS * ROWS);
  var keys = {};
  var craftingOpen = false;
  var gameWon = false;
  var lastToastT = 0;

  var homeCX = 0;
  var homeCY = 0;
  var homeR = 4;
  var campWood = 0;

  var player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 's',
    hp: 100,
    maxHp: 100,
    attackCd: 0,
    attackT: 0,
    sailing: false,
    boatBuilt: false,
  };

  var hotbar = [];
  var selectedSlot = 0;
  var HOTBAR_SLOTS = 10;

  var trees = [];
  var pickups = [];
  var chests = [];
  var bees = [];
  var golems = [];
  var serpents = [];
  var fox = { x: 0, y: 0 };

  var imgPlayer = new Image();
  var imgFox = new Image();
  var imgGolem = new Image();
  var sprPlayer = null;
  var sprFox = null;
  var sprGolem = null;
  var spritesReady = false;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    lastToastT = performance.now();
    setTimeout(function () {
      if (performance.now() - lastToastT >= 1800) toastEl.classList.remove('visible');
    }, 2000);
  }

  function idx(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return -1;
    return ty * COLS + tx;
  }

  function getTile(tx, ty) {
    var i = idx(tx, ty);
    if (i < 0) return T_WATER;
    return world[i];
  }

  function setTile(tx, ty, t) {
    var i = idx(tx, ty);
    if (i >= 0) world[i] = t;
  }

  function ellipseFill(cx, cy, rx, ry, tile) {
    var x0 = Math.max(0, Math.floor(cx - rx - 1));
    var x1 = Math.min(COLS - 1, Math.ceil(cx + rx + 1));
    var y0 = Math.max(0, Math.floor(cy - ry - 1));
    var y1 = Math.min(ROWS - 1, Math.ceil(cy + ry + 1));
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var nx = (tx - cx) / rx;
        var ny = (ty - cy) / ry;
        if (nx * nx + ny * ny <= 1.01) setTile(tx, ty, tile);
      }
    }
  }

  function ellipseRing(cx, cy, rx, ry, rInner, tile) {
    var x0 = Math.max(0, Math.floor(cx - rx - 1));
    var x1 = Math.min(COLS - 1, Math.ceil(cx + rx + 1));
    var y0 = Math.max(0, Math.floor(cy - ry - 1));
    var y1 = Math.min(ROWS - 1, Math.ceil(cy + ry + 1));
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var nx = (tx - cx) / rx;
        var ny = (ty - cy) / ry;
        var d = nx * nx + ny * ny;
        var nxi = rx > 0 ? (tx - cx) / Math.max(1, rx - rInner) : 0;
        var nyi = ry > 0 ? (ty - cy) / Math.max(1, ry - rInner) : 0;
        var di = nxi * nxi + nyi * nyi;
        if (d <= 1.01 && di > 1.01) setTile(tx, ty, tile);
      }
    }
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function randi(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function buildKeyedSpriteCanvas(img, keyR, keyG, keyB, tol) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    try {
      var id = x.getImageData(0, 0, c.width, c.height);
      var d = id.data;
      tol = tol == null ? 32 : tol;
      for (var i = 0; i < d.length; i += 4) {
        if (
          Math.abs(d[i] - keyR) <= tol &&
          Math.abs(d[i + 1] - keyG) <= tol &&
          Math.abs(d[i + 2] - keyB) <= tol
        ) {
          d[i + 3] = 0;
        }
      }
      x.putImageData(id, 0, 0);
    } catch (err) {
      /* file:// or tainted canvas */
    }
    return c;
  }

  function buildKeyedSpriteCanvasForGolem(img) {
    return buildKeyedSpriteCanvas(img, 128, 128, 128, 40);
  }

  function tryLoadSprites() {
    var left = 3;
    function finish() {
      left--;
      if (left > 0) return;
      if (imgPlayer.complete && imgPlayer.naturalWidth)
        sprPlayer = buildKeyedSpriteCanvas(imgPlayer, 0, 0, 0, 48);
      if (imgFox.complete && imgFox.naturalWidth) sprFox = buildKeyedSpriteCanvas(imgFox, 0, 0, 0, 48);
      if (imgGolem.complete && imgGolem.naturalWidth) sprGolem = buildKeyedSpriteCanvasForGolem(imgGolem);
      spritesReady = true;
    }
    function arm(img) {
      img.onload = finish;
      img.onerror = finish;
    }
    arm(imgPlayer);
    arm(imgFox);
    arm(imgGolem);
    imgPlayer.src = 'assets/player.png';
    imgFox.src = 'assets/fox.png';
    imgGolem.src = 'assets/golem.png';
  }

  function buildWorld() {
    world.fill(T_WATER);
    var mainCX = 52;
    var mainCY = 52;
    var sandRx = 38;
    var sandRy = 30;
    ellipseFill(mainCX, mainCY, sandRx, sandRy, T_SAND);
    ellipseFill(mainCX, mainCY, sandRx - 4, sandRy - 3, T_GRASS);
    ellipseFill(mainCX - 6, mainCY + 4, 16, 12, T_DESERT);
    ellipseFill(mainCX + 10, mainCY - 8, 14, 11, T_MOUNTAIN);
    ellipseRing(mainCX, mainCY, sandRx - 2, sandRy - 2, 5, T_DEBRIS);

    homeCX = mainCX - 14;
    homeCY = mainCY + 10;
    ellipseFill(homeCX, homeCY, 5, 4, T_SAND);

    var eastCX = 138;
    var eastCY = 50;
    ellipseFill(eastCX, eastCY, 18, 14, T_SAND);
    ellipseFill(eastCX, eastCY, 14, 11, T_GRASS);
    for (var gx = eastCX + 4; gx <= eastCX + 14; gx++) {
      for (var gy = eastCY - 3; gy <= eastCY + 3; gy++) {
        if (getTile(gx, gy) === T_SAND) setTile(gx, gy, T_FINISH);
      }
    }
    for (var ggx = eastCX + 20; ggx <= eastCX + 28; ggx++) {
      for (var ggy = eastCY - 6; ggy <= eastCY + 6; ggy++) {
        if (getTile(ggx, ggy) === T_WATER) setTile(ggx, ggy, TILE_GOAL);
      }
    }

    trees = [];
    pickups = [];
    chests = [];
    bees = [];
    golems = [];
    serpents = [];

    var t;
    for (var attempt = 0; attempt < 900; attempt++) {
      var tx = randi(8, COLS - 10);
      var ty = randi(8, ROWS - 10);
      t = getTile(tx, ty);
      if (t === T_GRASS && Math.random() < 0.35) {
        trees.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, hp: 18 });
      }
    }
    for (var p = 0; p < 55; p++) {
      tx = randi(10, COLS - 12);
      ty = randi(10, ROWS - 12);
      t = getTile(tx, ty);
      if (t === T_GRASS || t === T_SAND) {
        var fk = FOOD_TYPES[randi(0, FOOD_TYPES.length - 1)];
        pickups.push({ x: tx * TILE + rand(8, 24), y: ty * TILE + rand(8, 24), kind: fk, amt: 1 });
      }
    }
    for (var r = 0; r < 40; r++) {
      tx = randi(10, COLS - 12);
      ty = randi(10, ROWS - 12);
      t = getTile(tx, ty);
      if (t === T_DESERT || t === T_MOUNTAIN || t === T_GRASS) {
        pickups.push({ x: tx * TILE + rand(8, 24), y: ty * TILE + rand(8, 24), kind: 'rock', amt: randi(1, 2) });
      }
    }
    for (var w = 0; w < 28; w++) {
      tx = randi(10, COLS - 12);
      ty = randi(10, ROWS - 12);
      t = getTile(tx, ty);
      if (t === T_GRASS || t === T_SAND) {
        pickups.push({ x: tx * TILE + rand(8, 24), y: ty * TILE + rand(8, 24), kind: 'wood', amt: randi(1, 3) });
      }
    }

    var hutX = mainCX + 12;
    var hutY = mainCY - 6;
    for (var hx = -2; hx <= 2; hx++) {
      for (var hy = -2; hy <= 2; hy++) {
        var htx = hutX + hx;
        var hty = hutY + hy;
        if (getTile(htx, hty) === T_GRASS) setTile(htx, hty, T_SAND);
      }
    }
    chests.push({
      x: hutX * TILE + TILE / 2,
      y: hutY * TILE + TILE / 2,
      open: false,
      loot: [
        { kind: 'berries', count: 3 },
        { kind: 'rock', count: 2 },
        { kind: 'wood', count: 4 },
      ],
    });

    for (var b = 0; b < 16; b++) {
      tx = randi(15, 95);
      ty = randi(15, 90);
      if (getTile(tx, ty) === T_GRASS) {
        bees.push({
          x: tx * TILE + TILE / 2,
          y: ty * TILE + TILE / 2,
          vx: rand(-0.4, 0.4),
          vy: rand(-0.4, 0.4),
          hp: 10,
          stingT: 0,
        });
      }
    }
    for (var g = 0; g < 7; g++) {
      tx = randi(mainCX - 8, mainCX + 22);
      ty = randi(mainCY - 18, mainCY + 4);
      if (getTile(tx, ty) === T_MOUNTAIN) {
        golems.push({
          x: tx * TILE + TILE / 2,
          y: ty * TILE + TILE / 2,
          hp: GOLEM_HP,
          hitFlash: 0,
        });
      }
    }

    player.x = homeCX * TILE + TILE / 2;
    player.y = homeCY * TILE + TILE / 2;
    player.facing = 'e';
    player.sailing = false;
    player.hp = 100;
    fox.x = player.x - 20;
    fox.y = player.y;
    campWood = 0;
    player.boatBuilt = false;
  }

  function tileBlocksWalkFoot(t, sailing) {
    if (sailing) return t !== T_WATER && t !== TILE_GOAL;
    if (t === T_DEBRIS) return true;
    if (t === T_WATER || t === TILE_GOAL) return true;
    return false;
  }

  function rectTiles(px, py, hw, hh) {
    var l = px - hw;
    var r = px + hw;
    var t = py - hh;
    var b = py + hh;
    return {
      tx0: Math.floor(l / TILE),
      tx1: Math.floor((r - 0.001) / TILE),
      ty0: Math.floor(t / TILE),
      ty1: Math.floor((b - 0.001) / TILE),
    };
  }

  function walkableAt(px, py, sailing) {
    var hw = PLAYER_W / 2 - 1;
    var hh = PLAYER_H / 2 - 1;
    var R = rectTiles(px, py, hw, hh);
    for (var ty = R.ty0; ty <= R.ty1; ty++) {
      for (var tx = R.tx0; tx <= R.tx1; tx++) {
        if (tileBlocksWalkFoot(getTile(tx, ty), sailing)) return false;
      }
    }
    return true;
  }

  function inHomeZone(px, py) {
    var tcx = px / TILE;
    var tcy = py / TILE;
    var dx = tcx - homeCX;
    var dy = tcy - homeCY;
    return dx * dx + dy * dy <= homeR * homeR + 1;
  }

  function isBeachOrCampLaunch(px, py) {
    var R = rectTiles(px, py, PLAYER_W / 2, PLAYER_H / 2);
    var sandNearWater = false;
    for (var ty = R.ty0 - 1; ty <= R.ty1 + 1; ty++) {
      for (var tx = R.tx0 - 1; tx <= R.tx1 + 1; tx++) {
        var g = getTile(tx, ty);
        if (g === T_SAND || g === T_GRASS || g === T_FINISH) {
          if (
            getTile(tx + 1, ty) === T_WATER ||
            getTile(tx - 1, ty) === T_WATER ||
            getTile(tx, ty + 1) === T_WATER ||
            getTile(tx, ty - 1) === T_WATER
          ) {
            sandNearWater = true;
          }
        }
      }
    }
    return inHomeZone(px, py) || sandNearWater;
  }

  function canLandHere(px, py) {
    var tx = Math.floor(px / TILE);
    var ty = Math.floor(py / TILE);
    var t = getTile(tx, ty);
    if (t !== T_SAND && t !== T_GRASS && t !== T_FINISH) return false;
    return (
      getTile(tx + 1, ty) === T_WATER ||
      getTile(tx - 1, ty) === T_WATER ||
      getTile(tx, ty + 1) === T_WATER ||
      getTile(tx, ty - 1) === T_WATER ||
      getTile(tx + 1, ty) === TILE_GOAL ||
      getTile(tx - 1, ty) === TILE_GOAL ||
      getTile(tx, ty + 1) === TILE_GOAL ||
      getTile(tx, ty - 1) === TILE_GOAL
    );
  }

  function addHotbar(kind, count) {
    var meta = ITEM_META[kind];
    var maxStack = meta ? meta.stack : 99;
    var left = count;
    for (var i = 0; i < hotbar.length && left > 0; i++) {
      var s = hotbar[i];
      if (s && s.kind === kind && s.count < maxStack) {
        var add = Math.min(maxStack - s.count, left);
        s.count += add;
        left -= add;
      }
    }
    while (left > 0 && hotbar.length < HOTBAR_SLOTS) {
      var take = Math.min(maxStack, left);
      hotbar.push({ kind: kind, count: take });
      left -= take;
    }
    if (left > 0) toast('Inventory full — some loot lost.');
  }

  function invCountKind(kind) {
    var n = 0;
    for (var i = 0; i < hotbar.length; i++) {
      if (hotbar[i] && hotbar[i].kind === kind) n += hotbar[i].count;
    }
    return n;
  }

  function consumeNeeds(needs) {
    var copy = {};
    var k;
    for (k in needs) copy[k] = needs[k];
    for (var i = hotbar.length - 1; i >= 0; i--) {
      var s = hotbar[i];
      if (!s || !copy[s.kind] || copy[s.kind] <= 0) continue;
      var use = Math.min(s.count, copy[s.kind]);
      s.count -= use;
      copy[s.kind] -= use;
      if (s.count <= 0) hotbar.splice(i, 1);
    }
    for (k in copy) if (copy[k] > 0) return false;
    return true;
  }

  function hasNeeds(needs) {
    for (var k in needs) {
      if (invCountKind(k) < needs[k]) return false;
    }
    return true;
  }

  function getEquippedWeapon() {
    var s = hotbar[selectedSlot];
    if (!s) return { kind: 'stick', dmg: 4 };
    var m = ITEM_META[s.kind];
    if (m && m.type === 'weapon') return { kind: s.kind, dmg: m.dmg };
    return { kind: 'stick', dmg: 4 };
  }

  function meleeHitsTarget(ax, ay, aw, ah, tx, ty, tw, th, pad) {
    pad = pad || 0;
    return !(
      ax + aw / 2 + pad < tx - tw / 2 ||
      ax - aw / 2 - pad > tx + tw / 2 ||
      ay + ah / 2 + pad < ty - th / 2 ||
      ay - ah / 2 - pad > ty + th / 2
    );
  }

  function attackHitbox() {
    var reach = player.sailing ? 0 : 26;
    var wide = 22;
    var px = player.x;
    var py = player.y;
    if (player.facing === 'n') return { x: px, y: py - reach, w: wide, h: 20 };
    if (player.facing === 's') return { x: px, y: py + reach, w: wide, h: 20 };
    if (player.facing === 'w') return { x: px - reach, y: py, w: 20, h: wide };
    return { x: px + reach, y: py, w: 20, h: wide };
  }

  function doAttack() {
    if (player.attackCd > 0 || craftingOpen || gameWon) return;
    var w = getEquippedWeapon();
    var dmg = w.dmg;
    if (w.kind === 'pickaxe') dmg = Math.floor(dmg * 1.45);
    player.attackCd = w.kind === 'sword' ? 0.22 : 0.3;
    player.attackT = 0.16;
    var hb = attackHitbox();
    var padBee = 10;
    var padGolem = 8;

    for (var i = trees.length - 1; i >= 0; i--) {
      var tr = trees[i];
      if (meleeHitsTarget(hb.x, hb.y, hb.w, hb.h, tr.x, tr.y, 20, 24, 4)) {
        var cut = w.kind === 'axe' ? 9 : dmg;
        tr.hp -= cut;
        if (tr.hp <= 0) {
          addHotbar('wood', randi(2, 4));
          trees.splice(i, 1);
        }
      }
    }
    for (var bi = bees.length - 1; bi >= 0; bi--) {
      var bee = bees[bi];
      if (meleeHitsTarget(hb.x, hb.y, hb.w, hb.h, bee.x, bee.y, 14, 14, padBee)) {
        bee.hp -= dmg;
        if (bee.hp <= 0) {
          if (Math.random() < 0.35) addHotbar('berries', 1);
          bees.splice(bi, 1);
        }
      }
    }
    for (var gi = golems.length - 1; gi >= 0; gi--) {
      var go = golems[gi];
      if (meleeHitsTarget(hb.x, hb.y, hb.w, hb.h, go.x, go.y, 22, 26, padGolem)) {
        var gd = dmg;
        if (w.kind === 'pickaxe') gd = Math.floor(gd * 1.45);
        go.hp -= gd;
        go.hitFlash = 0.14;
        if (go.hp <= 0) {
          addHotbar('rock', randi(2, 4));
          golems.splice(gi, 1);
        }
      }
    }
    for (var si = serpents.length - 1; si >= 0; si--) {
      var se = serpents[si];
      if (meleeHitsTarget(hb.x, hb.y, hb.w, hb.h, se.x, se.y, 28, 14, 6)) {
        se.hp -= dmg;
        if (se.hp <= 0) {
          if (Math.random() < 0.5) addHotbar('fish', 1);
          serpents.splice(si, 1);
        }
      }
    }
  }

  function depositWoodCamp() {
    if (!inHomeZone(player.x, player.y) || player.sailing) {
      toast('Stand in the wreck camp to deposit wood.');
      return;
    }
    var total = invCountKind('wood');
    if (total <= 0) {
      toast('No wood to deposit.');
      return;
    }
    var needs = { wood: total };
    consumeNeeds(needs);
    campWood += total;
    toast('Deposited ' + total + ' wood. Camp: ' + campWood + '/' + WOOD_TO_REBUILD);
    if (campWood >= WOOD_TO_REBUILD) {
      player.boatBuilt = true;
      toast('Hull restored — launch with B from camp or beach.');
    }
  }

  function tryLaunchBoat() {
    if (!player.boatBuilt) {
      toast('Rebuild the hull: deposit ' + WOOD_TO_REBUILD + ' wood at camp (G).');
      return;
    }
    if (!isBeachOrCampLaunch(player.x, player.y)) {
      toast('Launch from camp or a beach next to open water (B).');
      return;
    }
    player.sailing = true;
    player.facing = 'e';
    toast('Under sail — reach the gold buoys east. L to land.');
  }

  function tryLandBoat() {
    if (!player.sailing) return;
    if (!canLandHere(player.x, player.y)) {
      toast('Sidle onto sand or grass beside shallows (L).');
      return;
    }
    player.sailing = false;
    toast('Beached.');
  }

  function tryOpenChest() {
    for (var i = 0; i < chests.length; i++) {
      var ch = chests[i];
      var dx = ch.x - player.x;
      var dy = ch.y - player.y;
      if (dx * dx + dy * dy < 38 * 38) {
        if (ch.open) {
          toast('Chest empty.');
          return;
        }
        ch.open = true;
        for (var j = 0; j < ch.loot.length; j++) {
          var L = ch.loot[j];
          addHotbar(L.kind, L.count);
        }
        toast('Chest opened.');
        return;
      }
    }
  }

  function eatSelectedFood() {
    var s = hotbar[selectedSlot];
    if (!s) return;
    var m = ITEM_META[s.kind];
    if (!m || m.type !== 'food') return;
    player.hp = Math.min(player.maxHp, player.hp + m.heal);
    s.count--;
    if (s.count <= 0) hotbar.splice(selectedSlot, 1);
    toast('Ate ' + m.name + ' (+' + m.heal + ' HP)');
  }

  function checkWin() {
    if (!player.sailing || gameWon) return;
    var tx = Math.floor(player.x / TILE);
    var ty = Math.floor(player.y / TILE);
    if (getTile(tx, ty) === TILE_GOAL) {
      gameWon = true;
      winOverlay.classList.add('visible');
      winOverlay.setAttribute('aria-hidden', 'false');
      toast('You made it home!');
    }
  }

  function updateSerpentsSpawn(dtSec) {
    if (!player.sailing || craftingOpen) return;
    if (serpents.length >= 6) return;
    if (Math.random() < 0.055 * dtSec) {
      var angle = rand(0, Math.PI * 2);
      var dist = rand(180, 260);
      var sx = player.x + Math.cos(angle) * dist;
      var sy = player.y + Math.sin(angle) * dist;
      if (walkableAt(sx, sy, true)) {
        serpents.push({ x: sx, y: sy, hp: 22, vx: 0, vy: 0 });
      }
    }
  }

  function updateEntities(dt) {
    var i;
    for (i = 0; i < bees.length; i++) {
      var bee = bees[i];
      bee.x += bee.vx * 32 * dt;
      bee.y += bee.vy * 32 * dt;
      if (Math.random() < 0.02) {
        bee.vx += rand(-0.15, 0.15);
        bee.vy += rand(-0.15, 0.15);
      }
      if (!walkableAt(bee.x, bee.y, false)) {
        bee.x -= bee.vx * 32 * dt;
        bee.y -= bee.vy * 32 * dt;
        bee.vx *= -1;
        bee.vy *= -1;
      }
      bee.stingT -= dt;
      if (bee.stingT < 0) bee.stingT = 0;
      var bdx = player.x - bee.x;
      var bdy = player.y - bee.y;
      if (bdx * bdx + bdy * bdy < 26 * 26 && !player.sailing) {
        if (bee.stingT <= 0) {
          player.hp -= 4;
          bee.stingT = 0.75;
        }
      }
    }
    for (i = 0; i < golems.length; i++) {
      var go = golems[i];
      if (go.hitFlash > 0) go.hitFlash -= dt;
      var ngx = (player.x - go.x) * 0.032;
      var ngy = (player.y - go.y) * 0.032;
      var nx = go.x + ngx * 36 * dt;
      var ny = go.y + ngy * 36 * dt;
      var mtx = Math.floor(nx / TILE);
      var mty = Math.floor(ny / TILE);
      if (getTile(mtx, mty) === T_MOUNTAIN && walkableAt(nx, ny, false)) {
        go.x = nx;
        go.y = ny;
      } else {
        var ox = (player.x - go.x) * 0.015;
        var oy = (player.y - go.y) * 0.015;
        var ox2 = go.x + ox * 36 * dt;
        var oy2 = go.y + oy * 36 * dt;
        var tx2 = Math.floor(ox2 / TILE);
        var ty2 = Math.floor(oy2 / TILE);
        if (getTile(tx2, ty2) === T_MOUNTAIN && walkableAt(ox2, oy2, false)) {
          go.x = ox2;
          go.y = oy2;
        }
      }
      var gdx = player.x - go.x;
      var gdy = player.y - go.y;
      if (gdx * gdx + gdy * gdy < 22 * 22 && !player.sailing) {
        player.hp -= 8 * dt;
      }
    }
    for (i = 0; i < serpents.length; i++) {
      var se = serpents[i];
      var sdx = player.x - se.x;
      var sdy = player.y - se.y;
      var slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
      se.vx = (sdx / slen) * 0.55;
      se.vy = (sdy / slen) * 0.55;
      var nsx = se.x + se.vx * 46 * dt;
      var nsy = se.y + se.vy * 46 * dt;
      if (walkableAt(nsx, nsy, true)) {
        se.x = nsx;
        se.y = nsy;
      }
      if (player.sailing && slen < 24) {
        player.hp -= 11 * dt;
      }
    }

    var fx = player.x - (player.facing === 'w' ? 22 : player.facing === 'e' ? -22 : 0);
    var fy = player.y - (player.facing === 'n' ? 22 : player.facing === 's' ? -22 : 0);
    fox.x += (fx - fox.x) * 5.5 * dt;
    fox.y += (fy - fox.y) * 5.5 * dt;

    for (i = pickups.length - 1; i >= 0; i--) {
      var pk = pickups[i];
      var pdx = pk.x - player.x;
      var pdy = pk.y - player.y;
      if (pdx * pdx + pdy * pdy < 20 * 20) {
        addHotbar(pk.kind, pk.amt);
        pickups.splice(i, 1);
      }
    }

    if (player.hp <= 0) {
      player.hp = 0;
      toast('You collapse… reload to retry.');
    }
  }

  function updatePlayer(dt) {
    if (craftingOpen || gameWon) return;
    player.attackCd = Math.max(0, player.attackCd - dt);
    player.attackT = Math.max(0, player.attackT - dt);
    var sp = player.sailing ? 1 : 1;
    player.vx = 0;
    player.vy = 0;
    if (keys['w'] || keys['W']) {
      player.vy = -sp;
      player.facing = 'n';
    }
    if (keys['s'] || keys['S']) {
      player.vy = sp;
      player.facing = 's';
    }
    if (keys['a'] || keys['A']) {
      player.vx = -sp;
      player.facing = 'w';
    }
    if (keys['d'] || keys['D']) {
      player.vx = sp;
      player.facing = 'e';
    }
    if (player.vx && player.vy) {
      player.vx *= 0.707;
      player.vy *= 0.707;
    }
    var move = (player.sailing ? 118 : 86) * dt;
    var nx = player.x + player.vx * move;
    var ny = player.y + player.vy * move;
    if (walkableAt(nx, player.y, player.sailing)) player.x = nx;
    if (walkableAt(player.x, ny, player.sailing)) player.y = ny;
    checkWin();
  }

  var TILE_RGB = {
    0: '#1a4a6e',
    1: '#c2a878',
    2: '#2d6a3a',
    3: '#4a4038',
    4: '#b89a50',
    5: '#6a6a72',
    6: '#8a7a60',
    7: '#d4b020',
  };

  function drawWorld(camX, camY) {
    var tx0 = Math.floor(camX / TILE);
    var ty0 = Math.floor(camY / TILE);
    var tw = Math.ceil(VIEW_W / TILE) + 2;
    var th = Math.ceil(VIEW_H / TILE) + 2;
    for (var j = 0; j < th; j++) {
      for (var i = 0; i < tw; i++) {
        var tx = tx0 + i;
        var ty = ty0 + j;
        var t = getTile(tx, ty);
        ctx.fillStyle = TILE_RGB[t] || '#000';
        ctx.fillRect(tx * TILE - camX, ty * TILE - camY, TILE + 1, TILE + 1);
      }
    }
  }

  function drawMeleeSwing(camX, camY) {
    if (player.attackT <= 0 || player.sailing) return;
    var hb = attackHitbox();
    var cx = hb.x - camX;
    var cy = hb.y - camY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,200,0.65)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    var atkDur = 0.16;
    var sweep = (1 - Math.min(1, player.attackT / atkDur)) * Math.PI * 0.85;
    var start = 0;
    if (player.facing === 'n') start = -Math.PI / 2 - sweep / 2;
    if (player.facing === 's') start = Math.PI / 2 - sweep / 2;
    if (player.facing === 'w') start = Math.PI - sweep / 2;
    if (player.facing === 'e') start = -sweep / 2;
    ctx.arc(player.x - camX, player.y - camY, 28, start, start + sweep);
    ctx.stroke();
    ctx.restore();
  }

  function drawBoat(camX, camY) {
    ctx.save();
    ctx.translate(player.x - camX, player.y - camY);
    if (player.facing === 'w') ctx.rotate(-Math.PI / 2);
    else if (player.facing === 'e') ctx.rotate(Math.PI / 2);
    else if (player.facing === 'n') ctx.rotate(Math.PI);
    ctx.fillStyle = '#5a4030';
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a7060';
    ctx.fillRect(-6, -14, 12, 10);
    ctx.restore();
  }

  function drawPlayer(camX, camY) {
    var lunge = player.attackT > 0 && !player.sailing ? 5 : 0;
    var ox = 0;
    var oy = 0;
    if (player.facing === 'n') oy = -lunge;
    if (player.facing === 's') oy = lunge;
    if (player.facing === 'w') ox = -lunge;
    if (player.facing === 'e') ox = lunge;

    if (player.sailing) {
      drawBoat(camX, camY);
      return;
    }

    var px = player.x - camX + ox;
    var py = player.y - camY + oy;
    if (sprPlayer) {
      ctx.save();
      ctx.translate(px, py);
      if (player.facing === 'w') ctx.scale(-1, 1);
      ctx.drawImage(sprPlayer, -PLAYER_W / 2, -PLAYER_H / 2, PLAYER_W, PLAYER_H);
      ctx.restore();
    } else {
      ctx.fillStyle = '#4a8aba';
      ctx.fillRect(px - PLAYER_W / 2, py - PLAYER_H / 2, PLAYER_W, PLAYER_H);
    }
  }

  function drawFox(camX, camY) {
    var fx = fox.x - camX;
    var fy = fox.y - camY;
    if (sprFox) {
      ctx.save();
      ctx.translate(fx, fy);
      if (player.x < fox.x) ctx.scale(-1, 1);
      ctx.drawImage(sprFox, -14, -12, 28, 24);
      ctx.restore();
    } else {
      ctx.fillStyle = '#c07040';
      ctx.fillRect(fx - 12, fy - 10, 24, 20);
    }
  }

  function drawEntities(camX, camY) {
    var i;
    for (i = 0; i < trees.length; i++) {
      var tr = trees[i];
      ctx.fillStyle = '#1a4a1a';
      ctx.fillRect(tr.x - camX - 10, tr.y - camY - 18, 20, 22);
      ctx.fillStyle = '#2d8a32';
      ctx.beginPath();
      ctx.arc(tr.x - camX, tr.y - camY - 8, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i];
      var m = ITEM_META[pk.kind];
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m ? m.emoji : '?', pk.x - camX, pk.y - camY + 5);
    }
    for (i = 0; i < chests.length; i++) {
      var ch = chests[i];
      ctx.fillStyle = ch.open ? '#5a4838' : '#8a6040';
      ctx.fillRect(ch.x - camX - 12, ch.y - camY - 10, 24, 18);
    }
    for (i = 0; i < bees.length; i++) {
      var bee = bees[i];
      ctx.fillStyle = '#e8d020';
      ctx.beginPath();
      ctx.arc(bee.x - camX, bee.y - camY, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (i = 0; i < golems.length; i++) {
      var go = golems[i];
      if (sprGolem) {
        ctx.save();
        ctx.translate(go.x - camX, go.y - camY);
        if (player.x < go.x) ctx.scale(-1, 1);
        if (go.hitFlash > 0) ctx.filter = 'brightness(1.8)';
        ctx.drawImage(sprGolem, -20, -28, 40, 36);
        ctx.filter = 'none';
        ctx.restore();
      } else {
        ctx.fillStyle = go.hitFlash > 0 ? '#aaa' : '#5a5a60';
        ctx.fillRect(go.x - camX - 14, go.y - camY - 18, 28, 28);
      }
    }
    for (i = 0; i < serpents.length; i++) {
      var se = serpents[i];
      ctx.fillStyle = '#2a6a4a';
      ctx.fillRect(se.x - camX - 16, se.y - camY - 6, 32, 12);
      ctx.fillStyle = '#1a4a32';
      ctx.beginPath();
      ctx.arc(se.x - camX + 12, se.y - camY, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHud(camX, camY) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(8, 8, 160, 22);
    ctx.fillStyle = '#3a8a3a';
    ctx.fillRect(10, 10, 156 * (player.hp / player.maxHp), 18);
    ctx.strokeStyle = '#2a2a2a';
    ctx.strokeRect(9, 9, 158, 20);
    ctx.fillStyle = '#f0f0e8';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('HP ' + Math.ceil(player.hp) + '/' + player.maxHp, 14, 23);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(8, 36, 200, 18);
    ctx.fillStyle = '#c9a85c';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('Camp wood: ' + campWood + '/' + WOOD_TO_REBUILD, 12, 49);
    if (player.sailing) {
      ctx.fillStyle = '#7ab8c8';
      ctx.fillText('SAILING', VIEW_W - 72, 23);
    }
    ctx.restore();
  }

  function render() {
    var camX = player.x - VIEW_W / 2;
    var camY = player.y - VIEW_H / 2;
    camX = Math.max(0, Math.min(camX, COLS * TILE - VIEW_W));
    camY = Math.max(0, Math.min(camY, ROWS * TILE - VIEW_H));
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawWorld(camX, camY);
    drawEntities(camX, camY);
    drawMeleeSwing(camX, camY);
    drawFox(camX, camY);
    drawPlayer(camX, camY);
    drawHud(camX, camY);
  }

  function getEquippedPanelInfo() {
    var s = hotbar[selectedSlot];
    if (!s) {
      return {
        icon: '✋',
        title: 'Empty hand',
        subtitle: 'Slot ' + (selectedSlot + 1),
        stats: [],
        desc: 'Pick up driftwood, food, and ore. Craft tools with C.',
        hints: ['WASD move', 'X melee', 'Space chest'],
        attack: 'Unarmed punch — uses stick damage if no weapon.',
        mode: player.sailing ? 'Sailing: serpents in deep water. L to land.' : 'On foot: bees in the brush.',
      };
    }
    var m = ITEM_META[s.kind];
    var stats = ['Stack: ' + s.count + (m && m.stack ? ' / ' + m.stack : '')];
    var hints = [];
    var attack = '';
    if (m && m.type === 'weapon') {
      var dmg = m.dmg;
      if (s.kind === 'pickaxe') dmg = Math.floor(dmg * 1.45) + ' vs stone';
      attack = 'Melee ~' + m.dmg + ' base' + (s.kind === 'pickaxe' ? ' (pickaxe bonus vs golems)' : '');
      hints.push('X to swing');
      if (s.kind === 'axe') hints.push('Bonus vs trees');
    } else if (m && m.type === 'food') {
      attack = 'Click slot or use hotkey to eat (+' + m.heal + ' HP)';
      hints.push('Restores health');
    } else {
      attack = 'Resource — craft or deposit wood at camp (G).';
    }
    return {
      icon: m ? m.emoji : '?',
      title: m ? m.name : s.kind,
      subtitle: (m && m.type ? m.type : 'item') + ' · slot ' + (selectedSlot + 1),
      stats: stats,
      desc: m ? m.desc : '',
      hints: hints,
      attack: attack,
      mode: player.sailing ? 'Boat mode — faster on water.' : 'Land mode — debris blocks, mountains passable.',
    };
  }

  function updateEquippedPanel() {
    var inf = getEquippedPanelInfo();
    equipSlotIcon.textContent = inf.icon;
    equipTitle.textContent = inf.title;
    equipSubtitle.textContent = inf.subtitle;
    equipStats.innerHTML = '';
    for (var i = 0; i < inf.stats.length; i++) {
      var li = document.createElement('li');
      li.textContent = inf.stats[i];
      equipStats.appendChild(li);
    }
    equipDesc.textContent = inf.desc;
    equipHints.innerHTML = '';
    for (var j = 0; j < inf.hints.length; j++) {
      var hli = document.createElement('li');
      hli.textContent = inf.hints[j];
      equipHints.appendChild(hli);
    }
    equipAttackLine.textContent = inf.attack;
    equipModeLine.textContent = inf.mode;
  }

  function renderHotbar() {
    hotbarEl.innerHTML = '';
    for (var i = 0; i < HOTBAR_SLOTS; i++) {
      var slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === selectedSlot ? ' selected' : '');
      slot.dataset.index = String(i);
      var s = hotbar[i];
      var keyLbl = document.createElement('span');
      keyLbl.className = 'key';
      keyLbl.textContent = i === 9 ? '0' : String(i + 1);
      slot.appendChild(keyLbl);
      if (s) {
        var em = document.createElement('span');
        em.className = 'emoji';
        em.textContent = ITEM_META[s.kind] ? ITEM_META[s.kind].emoji : '?';
        slot.appendChild(em);
        if (s.count > 1) {
          var ct = document.createElement('span');
          ct.className = 'count';
          ct.textContent = String(s.count);
          slot.appendChild(ct);
        }
      }
      slot.addEventListener('click', function (ev) {
        var el = ev.currentTarget;
        var ix = parseInt(el.dataset.index, 10);
        selectedSlot = ix;
        if (hotbar[ix] && ITEM_META[hotbar[ix].kind] && ITEM_META[hotbar[ix].kind].type === 'food') {
          eatSelectedFood();
        }
        renderHotbar();
        updateEquippedPanel();
      });
      hotbarEl.appendChild(slot);
    }
    updateEquippedPanel();
  }

  function renderCraftingList() {
    craftRecipesEl.innerHTML = '';
    craftStockEl.textContent =
      'Wood ' + invCountKind('wood') + ' · Rock ' + invCountKind('rock');
    for (var i = 0; i < CRAFT_RECIPES.length; i++) {
      var rec = CRAFT_RECIPES[i];
      var row = document.createElement('li');
      row.className = 'craft-row';
      var main = document.createElement('div');
      main.className = 'craft-row-main';
      var tit = document.createElement('div');
      tit.className = 'craft-title';
      tit.textContent = rec.title;
      var cost = document.createElement('div');
      cost.className = 'craft-cost';
      var parts = [];
      for (var k in rec.needs) parts.push(k + ' ×' + rec.needs[k]);
      cost.textContent = parts.join(' · ');
      main.appendChild(tit);
      main.appendChild(cost);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'craft-btn';
      btn.textContent = 'Craft';
      var can = hasNeeds(rec.needs);
      btn.disabled = !can;
      btn.addEventListener('click', function (recipe) {
        return function () {
          if (!hasNeeds(recipe.needs)) return;
          if (!consumeNeeds(recipe.needs)) return;
          addHotbar(recipe.out.kind, recipe.out.count);
          toast('Crafted ' + ITEM_META[recipe.out.kind].name);
          renderCraftingList();
          renderHotbar();
        };
      }(rec));
      row.appendChild(main);
      row.appendChild(btn);
      craftRecipesEl.appendChild(row);
    }
  }

  function setCraftingOpen(open) {
    craftingOpen = open;
    if (open) {
      craftOverlay.classList.add('visible');
      craftOverlay.setAttribute('aria-hidden', 'false');
      renderCraftingList();
    } else {
      craftOverlay.classList.remove('visible');
      craftOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  function onKeyDown(e) {
    keys[e.key] = true;
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      setCraftingOpen(!craftingOpen);
    }
    if (e.key === 'Escape') {
      if (craftingOpen) {
        e.preventDefault();
        setCraftingOpen(false);
      }
    }
    if (craftingOpen) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      tryOpenChest();
    }
    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      doAttack();
    }
    if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      depositWoodCamp();
    }
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      tryLaunchBoat();
    }
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      tryLandBoat();
    }
    var n = parseInt(e.key, 10);
    if (!isNaN(n) && n >= 1 && n <= 9) {
      selectedSlot = n - 1;
      renderHotbar();
    }
    if (e.key === '0') {
      selectedSlot = 9;
      renderHotbar();
    }
  }

  function onKeyUp(e) {
    keys[e.key] = false;
  }

  var lastT = performance.now();
  function tick(now) {
    var dtSec = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (!craftingOpen && !gameWon) {
      updatePlayer(dtSec);
      updateEntities(dtSec);
      updateSerpentsSpawn(dtSec);
    }
    render();
    requestAnimationFrame(tick);
  }

  function init() {
    hotbar = [{ kind: 'stick', count: 1 }];
    buildWorld();
    tryLoadSprites();
    renderHotbar();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', function () {
      canvas.focus();
    });
    canvas.focus();
    requestAnimationFrame(tick);
  }

  init();
})();
