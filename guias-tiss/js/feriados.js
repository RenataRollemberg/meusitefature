// Feriados usados para pular datas nas sessões repetidas (SP/SADT).
// Nacionais + estado do Rio de Janeiro + município do Rio de Janeiro.
// Pontos facultativos (segunda de Carnaval, Quarta-feira de Cinzas etc.) não entram.
'use strict'

;(function () {
  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC.
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
    return Date.UTC(ano, mes - 1, dia)
  }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10) }
  const DIA = 86400000

  const FIXOS_NACIONAIS = {
    '01-01': 'Confraternização Universal', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho',
    '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados',
    '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal'
  }
  const FIXOS_RJ = { '01-20': 'São Sebastião (município do Rio)', '04-23': 'São Jorge (estado do RJ)' }

  const cache = {}
  function doAno(ano) {
    if (cache[ano]) return cache[ano]
    const lista = {}
    Object.keys(FIXOS_NACIONAIS).forEach(function (md) { lista[ano + '-' + md] = FIXOS_NACIONAIS[md] })
    Object.keys(FIXOS_RJ).forEach(function (md) { lista[ano + '-' + md] = FIXOS_RJ[md] })
    const p = pascoa(ano)
    lista[iso(p - 47 * DIA)] = 'Carnaval (estado do RJ)'
    lista[iso(p - 2 * DIA)] = 'Sexta-feira Santa'
    lista[iso(p + 60 * DIA)] = 'Corpus Christi'
    cache[ano] = lista
    return lista
  }

  window.Feriados = {
    // Nome do feriado nessa data (AAAA-MM-DD) ou null.
    rj: function (data) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return null
      return doAno(Number(data.slice(0, 4)))[data] || null
    }
  }
})()
