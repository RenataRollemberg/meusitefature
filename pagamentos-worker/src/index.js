// Pagamentos do Guias TISS — roda na Cloudflare (Workers, plano grátis).
//
// O que faz:
//   POST /pagar    → o programa pede um link de pagamento do Mercado Pago para o cliente logado.
//                    forma "mensal": Checkout Pro (Pix, boleto ou cartão), cada pagamento libera 30 dias.
//                    forma "assinatura": cobrança automática todo mês no cartão.
//   POST /webhook  → o Mercado Pago avisa que houve um pagamento. O Worker confere o pagamento direto
//                    na API do Mercado Pago e, se aprovado, ativa o cliente no Firebase (Firestore).
//
// Segredos (configure no painel da Cloudflare: Worker → Configurações → Variáveis e segredos):
//   MP_ACCESS_TOKEN        Access Token de PRODUÇÃO da aplicação no Mercado Pago
//   MP_WEBHOOK_SECRET      "Assinatura secreta" das notificações (Webhooks) da aplicação no Mercado Pago
//   FIREBASE_CLIENT_EMAIL  client_email do arquivo JSON da conta de serviço do Firebase
//   FIREBASE_PRIVATE_KEY   private_key do mesmo arquivo (com as linhas -----BEGIN/END PRIVATE KEY-----)
// Variáveis comuns (wrangler.toml): FIREBASE_PROJECT_ID, FIREBASE_API_KEY, SITE_URL

// Mesmos planos de guias-tiss/js/planos.js. O preço cobrado vale o daqui (o navegador não decide o valor).
const PLANOS = {
  basico: { nome: 'Básico', mensal: 70 },
  basico2: { nome: 'Básico 2', mensal: 130 },
  clinica: { nome: 'Clínica', mensal: 280 },
  premium: { nome: 'Clínica Premium', mensal: 510 }
}

const DIAS_POR_PAGAMENTO = 30
const MP = 'https://api.mercadopago.com'

// Valores públicos (não são segredo) — usados se não forem configurados no painel.
const PADRAO = {
  FIREBASE_PROJECT_ID: 'guia-tiss',
  FIREBASE_API_KEY: 'AIzaSyBb_dL0ypyVm8ZgakRoZwUmeg_vcII2a_w',
  SITE_URL: 'https://guiaxmltiss.com.br'
}

export default {
  async fetch(request, envOriginal) {
    const env = Object.assign({}, PADRAO, envOriginal)
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    try {
      if (url.pathname === '/pagar' && request.method === 'POST') return await pagar(request, env, cors)
      if (url.pathname === '/webhook' && request.method === 'POST') return await webhook(request, env, url)
      if (url.pathname === '/' || url.pathname === '/status') {
        return json({ ok: true, servico: 'Pagamentos Guias TISS' }, 200, cors)
      }
      return json({ erro: 'Endereço não encontrado.' }, 404, cors)
    } catch (err) {
      console.error('Erro:', err && err.stack || err)
      return json({ erro: err.publico ? err.message : 'Não foi possível concluir agora. Tente de novo em instantes.' }, err.status || 500, cors)
    }
  }
}

// ---------------------------------------------------------------------------
// POST /pagar
// ---------------------------------------------------------------------------

async function pagar(request, env, cors) {
  const corpo = await request.json().catch(() => ({}))
  const plano = PLANOS[corpo.plano]
  if (!plano) throw erroPublico('Plano inválido.', 400)
  const forma = corpo.forma === 'assinatura' ? 'assinatura' : 'mensal'

  const usuario = await usuarioDoToken(corpo.idToken, env)
  const email = usuario.email
  const referencia = [email, corpo.plano, forma].join('|')
  const site = env.SITE_URL || 'https://guiaxmltiss.com.br'
  const voltar = site + '/guias-tiss/index.html?pagamento='
  const webhookUrl = new URL(request.url).origin + '/webhook'

  let link
  if (forma === 'mensal') {
    const pref = await mp(env, 'POST', '/checkout/preferences', {
      items: [{
        id: corpo.plano,
        title: 'Guias TISS — plano ' + plano.nome + ' (30 dias)',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: plano.mensal
      }],
      payer: { email },
      external_reference: referencia,
      notification_url: webhookUrl,
      back_urls: { success: voltar + 'ok', pending: voltar + 'pendente', failure: voltar + 'erro' },
      auto_return: 'approved',
      statement_descriptor: 'GUIASTISS'
    })
    link = pref.init_point
  } else {
    const assin = await mp(env, 'POST', '/preapproval', {
      reason: 'Guias TISS — plano ' + plano.nome,
      external_reference: referencia,
      payer_email: email,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plano.mensal,
        currency_id: 'BRL'
      },
      back_url: voltar + 'assinatura',
      status: 'pending'
    })
    link = assin.init_point
  }
  if (!link) throw erroPublico('O Mercado Pago não devolveu o link de pagamento. Tente de novo.', 502)
  return json({ url: link }, 200, cors)
}

// Confere o login do cliente direto no Firebase (o token vem do navegador).
async function usuarioDoToken(idToken, env) {
  if (!idToken) throw erroPublico('Entre na sua conta para pagar.', 401)
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + env.FIREBASE_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  })
  const d = await r.json().catch(() => ({}))
  const u = d.users && d.users[0]
  if (!r.ok || !u || !u.email) throw erroPublico('Sua sessão expirou. Saia e entre de novo na conta.', 401)
  if (!u.emailVerified) throw erroPublico('Confirme o seu e-mail antes de pagar.', 403)
  return { email: u.email.toLowerCase() }
}

// ---------------------------------------------------------------------------
// POST /webhook (avisos do Mercado Pago)
// ---------------------------------------------------------------------------

async function webhook(request, env, url) {
  const texto = await request.text()
  let corpo = {}
  try { corpo = JSON.parse(texto || '{}') } catch (e) { corpo = {} }

  const tipo = corpo.type || url.searchParams.get('type') || url.searchParams.get('topic') || ''
  const id = String((corpo.data && corpo.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id') || '')
  if (!id) return new Response('ok', { status: 200 })

  // Assinatura do aviso: garante que veio do Mercado Pago. (Mesmo sem ela, nada é ativado
  // sem conferir o pagamento na API do Mercado Pago logo abaixo.)
  if (env.MP_WEBHOOK_SECRET && !(await assinaturaValida(request, env.MP_WEBHOOK_SECRET, id))) {
    console.warn('Aviso com assinatura inválida, ignorado. id=' + id)
    return new Response('assinatura invalida', { status: 401 })
  }

  if (tipo === 'payment') {
    const pag = await mp(env, 'GET', '/v1/payments/' + encodeURIComponent(id))
    if (pag.status === 'approved') {
      await registrarPagamento(env, pag.external_reference, {
        pagamentoId: String(pag.id),
        valor: pag.transaction_amount,
        meio: pag.payment_method_id || pag.payment_type_id || ''
      })
    }
  } else if (tipo === 'subscription_authorized_payment') {
    // Cobrança mensal de uma assinatura no cartão.
    const cobranca = await mp(env, 'GET', '/authorized_payments/' + encodeURIComponent(id))
    const pago = cobranca.payment && cobranca.payment.status === 'approved'
    if (pago && cobranca.preapproval_id) {
      const assin = await mp(env, 'GET', '/preapproval/' + encodeURIComponent(cobranca.preapproval_id))
      await registrarPagamento(env, assin.external_reference, {
        pagamentoId: String(cobranca.payment.id || id),
        valor: cobranca.transaction_amount,
        meio: 'assinatura no cartão',
        assinaturaId: String(cobranca.preapproval_id)
      })
    }
  } else if (tipo === 'subscription_preapproval') {
    // Assinatura criada, pausada ou cancelada: só anota no cadastro.
    const assin = await mp(env, 'GET', '/preapproval/' + encodeURIComponent(id))
    const ref = lerReferencia(assin.external_reference)
    if (ref) {
      await gravarCliente(env, ref.email, {
        assinaturaId: String(assin.id),
        assinaturaStatus: String(assin.status || '')
      })
    }
  }
  return new Response('ok', { status: 200 })
}

function lerReferencia(ref) {
  const partes = String(ref || '').split('|')
  if (partes.length < 2 || !partes[0].includes('@') || !PLANOS[partes[1]]) return null
  return { email: partes[0].toLowerCase(), plano: partes[1], forma: partes[2] || 'mensal' }
}

// Ativa o cliente e soma 30 dias a partir do que ainda falta (ou de hoje).
async function registrarPagamento(env, referencia, info) {
  const ref = lerReferencia(referencia)
  if (!ref) { console.warn('Pagamento sem referência de cliente:', referencia, info.pagamentoId); return }

  const atual = await lerCliente(env, ref.email)
  if (atual && atual.ultimoPagamentoId === info.pagamentoId) return // aviso repetido

  const agora = Date.now()
  const pagoAteAtual = atual && atual.pagoAte ? Date.parse(atual.pagoAte) : 0
  const inicio = Math.max(agora, pagoAteAtual || 0)
  const novoFim = new Date(inicio + DIAS_POR_PAGAMENTO * 86400000)

  const campos = {
    status: 'ativo',
    plano: ref.plano,
    formaPagamento: ref.forma,
    pagoAte: novoFim,
    ultimoPagamentoId: info.pagamentoId,
    ultimoPagamentoEm: new Date(agora),
    ultimoPagamentoValor: Number(info.valor) || 0,
    ultimoPagamentoMeio: info.meio || ''
  }
  if (info.assinaturaId) campos.assinaturaId = info.assinaturaId
  if (!atual) Object.assign(campos, { email: ref.email, origem: 'pagamento', criadoEm: new Date(agora) })
  await gravarCliente(env, ref.email, campos)
  console.log('Cliente ativado:', ref.email, 'até', novoFim.toISOString())
}

// Confere o cabeçalho x-signature (HMAC SHA-256) que o Mercado Pago envia.
async function assinaturaValida(request, segredo, dataId) {
  const cab = request.headers.get('x-signature') || ''
  const reqId = request.headers.get('x-request-id') || ''
  const partes = Object.fromEntries(cab.split(',').map(p => p.trim().split('=')))
  if (!partes.ts || !partes.v1) return false
  const manifesto = 'id:' + dataId.toLowerCase() + ';request-id:' + reqId + ';ts:' + partes.ts + ';'
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto))
  const hex = [...new Uint8Array(assinatura)].map(b => b.toString(16).padStart(2, '0')).join('')
  return iguais(hex, partes.v1)
}

function iguais(a, b) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// ---------------------------------------------------------------------------
// Mercado Pago
// ---------------------------------------------------------------------------

async function mp(env, metodo, caminho, corpo) {
  if (!env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado.')
  const r = await fetch(MP + caminho, {
    method: metodo,
    headers: Object.assign(
      { Authorization: 'Bearer ' + env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      metodo === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}
    ),
    body: corpo ? JSON.stringify(corpo) : undefined
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    console.error('Mercado Pago', metodo, caminho, r.status, JSON.stringify(d))
    const msg = (d && (d.message || d.error)) || ('HTTP ' + r.status)
    const e = new Error('Mercado Pago: ' + msg)
    e.status = 502
    if (caminho === '/preapproval' && r.status < 500) {
      e.publico = true
      e.message = 'O Mercado Pago recusou a assinatura no cartão (' + msg + '). Tente "Pagar 30 dias" ou fale com o suporte.'
    }
    throw e
  }
  return d
}

// ---------------------------------------------------------------------------
// Firebase (Firestore) com a conta de serviço
// ---------------------------------------------------------------------------

let tokenGoogle = null

async function acessoGoogle(env) {
  if (tokenGoogle && tokenGoogle.expira > Date.now() + 60000) return tokenGoogle.valor
  const agora = Math.floor(Date.now() / 1000)
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const dados = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600
  }))
  const chave = await crypto.subtle.importKey(
    'pkcs8', pemParaBytes(env.FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(cab + '.' + dados))
  const jwt = cab + '.' + dados + '.' + b64url(assinatura)

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  })
  const d = await r.json()
  if (!r.ok) throw new Error('Google OAuth: ' + JSON.stringify(d))
  tokenGoogle = { valor: d.access_token, expira: Date.now() + (d.expires_in || 3600) * 1000 }
  return tokenGoogle.valor
}

function urlCliente(env, email) {
  return 'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/clientes/' + encodeURIComponent(email)
}

async function lerCliente(env, email) {
  const r = await fetch(urlCliente(env, email), { headers: { Authorization: 'Bearer ' + await acessoGoogle(env) } })
  if (r.status === 404) return null
  const d = await r.json()
  if (!r.ok) throw new Error('Firestore (ler): ' + JSON.stringify(d))
  const saida = {}
  for (const [k, v] of Object.entries(d.fields || {})) saida[k] = deFirestore(v)
  return saida
}

async function gravarCliente(env, email, campos) {
  const mascara = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&')
  const fields = {}
  for (const [k, v] of Object.entries(campos)) fields[k] = paraFirestore(v)
  const r = await fetch(urlCliente(env, email) + '?' + mascara, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await acessoGoogle(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  })
  if (!r.ok) throw new Error('Firestore (gravar): ' + await r.text())
}

function paraFirestore(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (v === null || v === undefined) return { nullValue: null }
  return { stringValue: String(v) }
}

function deFirestore(v) {
  if ('timestampValue' in v) return v.timestampValue
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('booleanValue' in v) return v.booleanValue
  return null
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function pemParaBytes(pem) {
  const b64 = String(pem || '').replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function b64url(dado) {
  const bytes = typeof dado === 'string' ? new TextEncoder().encode(dado) : new Uint8Array(dado)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function corsHeaders(request, env) {
  const origem = request.headers.get('Origin') || ''
  const permitidas = [env.SITE_URL || 'https://guiaxmltiss.com.br', 'https://www.guiaxmltiss.com.br']
  return {
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {})
  })
}

function erroPublico(mensagem, status) {
  const e = new Error(mensagem)
  e.publico = true
  e.status = status || 400
  return e
}
