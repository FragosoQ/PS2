const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateProgress,
  formatPercent,
  getCompletionSignal,
  isExactlyComplete,
  parseDuration,
  readSeriesValue,
} = require('../ps2-priority-progress.js');

function dateAt(day, hour, minute = 0, second = 0) {
  return new Date(2026, 9, day, hour, minute, second);
}

test('calcula os cinco patamares temporais e limita o progresso a 83,3%', () => {
  const stages = [
    [dateAt(22, 9, 30), 16.7],
    [dateAt(22, 11), 33.3],
    [dateAt(22, 12, 30), 50],
    [dateAt(22, 15), 66.7],
    [dateAt(22, 16, 30), 83.3],
    [dateAt(22, 18), 83.3],
  ];
  for (const [now, expected] of stages) {
    assert.equal(calculateProgress(dateAt(22, 8), '09:00:00', null, now), expected);
  }
  assert.equal(calculateProgress(dateAt(22, 8), '09:00:00', '100%', dateAt(22, 18)), 100);
});

test('aplica a pausa das 13:00 às 14:00 no exemplo indicado', () => {
  const now = dateAt(22, 14, 42);
  assert.equal(calculateProgress('11:49:52', '09:00:00', null, now), 16.7);
});

test('interpreta data e duração serializadas pelo gviz', () => {
  const now = dateAt(22, 14, 42);
  assert.equal(
    calculateProgress('Date(2026,9,22,11,49,52)', 'Date(1899,11,30,9,0,0)', null, now),
    16.7
  );
});

test('considera apenas tempo de trabalho entre dias úteis', () => {
  const start = dateAt(23, 17, 30);
  const now = dateAt(26, 9, 30);
  assert.equal(calculateProgress(start, '09:00:00', null, now), 16.7);
});

test('não acumula tempo depois das 17:15', () => {
  const start = dateAt(22, 16, 15);
  assert.equal(calculateProgress(start, '06:00:00', null, dateAt(22, 17, 15)), 16.7);
  assert.equal(calculateProgress(start, '06:00:00', null, dateAt(22, 18)), 16.7);
});

test('devolve sem progresso para dados temporais ausentes, mas permite conclusão a 100%', () => {
  const now = dateAt(22, 14, 42);
  assert.equal(calculateProgress(null, '09:00:00', null, now), null);
  assert.equal(calculateProgress('11:49:52', null, null, now), null);
  assert.equal(calculateProgress(null, null, '100%', now), 100);
});

test('só reconhece conclusão exatamente igual a 100%', () => {
  assert.equal(isExactlyComplete(1), true);
  assert.equal(isExactlyComplete('100,0%'), true);
  assert.equal(isExactlyComplete(0.999), false);
  assert.equal(isExactlyComplete('99,9%'), false);
  assert.equal(isExactlyComplete(null), false);
  assert.equal(calculateProgress(dateAt(22, 8), '09:00:00', '99,9%', dateAt(22, 18)), 83.3);
});

test('lê T/TP pelos cabeçalhos e mantém alinhamento pelas colunas da Sheet sem rótulos', () => {
  const table = {
    cols: [
      { id: 'EA', label: '' },
      { id: 'FA', label: '' },
    ],
  };
  const row = { c: [{ v: '11:49:52' }, { v: '09:00:00' }] };
  assert.equal(readSeriesValue(table, row, 'T', '1'), '11:49:52');
  assert.equal(readSeriesValue(table, row, 'TP', '1'), '09:00:00');
});

test('normaliza vírgulas e pontos nas prioridades fracionárias', () => {
  const table = { cols: [{ id: 'DX', label: '' }, { id: 'EY', label: '' }] };
  const row = { c: [{ v: '08:00:00' }, { v: '02:00:00' }] };
  assert.equal(readSeriesValue(table, row, 'T', 'P0,1'), '08:00:00');
  assert.equal(readSeriesValue(table, row, 'TP', '0.2'), '02:00:00');
});

test('associa o sinalizador de conclusão à prioridade ativa e formata com vírgula', () => {
  const table = { cols: [{ label: 'P1' }, { label: '%' }] };
  const row = { c: [{ v: null }, { v: 1, f: '100%' }] };
  assert.equal(getCompletionSignal(table, row, 1), 1);
  assert.equal(formatPercent(16.7), '16,7');
  assert.equal(formatPercent(50), '50,0');
});

test('interpreta duração decimal do gviz como fração de dia', () => {
  assert.equal(parseDuration(9 / 24), 9 * 60 * 60 * 1000);
});