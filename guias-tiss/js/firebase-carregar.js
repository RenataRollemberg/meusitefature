// Carrega o Firebase (app + autenticação) só quando o login estiver configurado.
// Usado pela página de login e pelo aplicativo.
'use strict'

const FIREBASE_VERSAO = '10.12.2'

function loginAtivo() {
  return typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG !== null
}

function carregarScript(url) {
  return new Promise(function (resolve, reject) {
    const s = document.createElement('script')
    s.src = url
    s.onload = resolve
    s.onerror = function () { reject(new Error('Não foi possível carregar o login. Verifique a internet.')) }
    document.head.appendChild(s)
  })
}

let firebaseAuthPromise = null
function obterAuth() {
  if (!firebaseAuthPromise) {
    const base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSAO + '/'
    firebaseAuthPromise = carregarScript(base + 'firebase-app-compat.js')
      .then(function () { return carregarScript(base + 'firebase-auth-compat.js') })
      .then(function () {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG)
        const auth = firebase.auth()
        auth.languageCode = 'pt'
        return auth
      })
  }
  return firebaseAuthPromise
}

// Banco de dados (Firestore): cadastro dos clientes, plano e serviço Faturista.
let firebaseDbPromise = null
function obterDb() {
  if (!firebaseDbPromise) {
    firebaseDbPromise = obterAuth()
      .then(function () { return carregarScript('https://www.gstatic.com/firebasejs/' + FIREBASE_VERSAO + '/firebase-firestore-compat.js') })
      .then(function () { return firebase.firestore() })
  }
  return firebaseDbPromise
}

// Documento do cliente na coleção "clientes" (o nome do documento é o e-mail).
function docCliente(db, email) {
  return db.collection('clientes').doc(String(email).trim().toLowerCase())
}

// Converte datas do Firestore (Timestamp) ou texto em Date.
function paraData(valor) {
  if (!valor) return null
  if (typeof valor.toDate === 'function') return valor.toDate()
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

// Dias de teste que ainda restam para a conta (0 quando acabou).
function diasRestantesTeste(user) {
  const criada = new Date(user.metadata.creationTime).getTime()
  const fim = criada + DIAS_TESTE * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((fim - Date.now()) / (24 * 60 * 60 * 1000)))
}

// Mensagens do Firebase em português.
function mensagemErro(err) {
  const mapa = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-password': 'Digite a senha.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'permission-denied': 'Sem permissão. Confira se as regras do Firestore foram publicadas.',
    'unavailable': 'Sem conexão com o servidor. Verifique a internet.'
  }
  return mapa[err && err.code] || (err && err.message) || 'Algo deu errado. Tente de novo.'
}
