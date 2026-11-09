// Pruebas de los helpers de avisos por WhatsApp (bloque <wa-helpers> de index.html). Uso: node test/wa-helpers.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ <wa-helpers>([\s\S]*?)\/\/ <\/wa-helpers>/);
const g = vm.createContext({});
if (m) vm.runInContext(m[1], g);
const casos = {
  'bloque wa-helpers presente': () => assert.ok(m, 'falta el bloque // <wa-helpers> en index.html'),
  'waEnlaceDirecto quita el + y codifica': () => assert.strictEqual(g.waEnlaceDirecto('+34600111222', 'a b'), 'https://wa.me/34600111222?text=a%20b'),
  'waEnlaceLibre codifica saltos de línea': () => assert.strictEqual(g.waEnlaceLibre('a\nb'), 'whatsapp://send?text=a%0Ab'),
  'waEnlaceSMS': () => assert.strictEqual(g.waEnlaceSMS('+34600111222', 'hola'), 'sms:+34600111222?&body=hola'),
  'waBarra(3,4) contiene 3 de 4': () => { const h = g.waBarra(3, 4); assert.ok(h.includes('3 de 4')); assert.ok(h.includes('width:75%')); },
  'waBarra(0,0) no divide entre cero': () => assert.ok(g.waBarra(0, 0).includes('width:0%')),
  'waRecordatorio recorta el aviso y añade el enlace': () => { const t = g.waRecordatorio('x'.repeat(100), 'https://e/c?a=1&c=X'); assert.ok(t.endsWith('https://e/c?a=1&c=X')); assert.ok(t.includes('…')); assert.ok(t.length < 200); },
};
let f = 0; for (const [n, fn] of Object.entries(casos)) { try { fn(); console.log('OK   ' + n); } catch (e) { f++; console.log('FALLO ' + n + ' — ' + e.message); } }
process.exit(f ? 1 : 0);
