// Configuração do Firebase do Guias TISS.
//
// Enquanto estiver null, o login fica desligado: a página "Entrar" mostra
// "em breve" e o aplicativo abre direto, como antes.
//
// Para ligar o login: no Firebase (console.firebase.google.com) abra o projeto →
// Configurações do projeto → Seus apps → app da Web → copie o objeto
// "firebaseConfig" e cole aqui no lugar de null. Exemplo:
//
// const FIREBASE_CONFIG = {
//   apiKey: "...",
//   authDomain: "guias-tiss.firebaseapp.com",
//   projectId: "guias-tiss",
//   appId: "..."
// };
//
// Esses dados não são senha: o Firebase foi feito para eles ficarem no site.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBb_dL0ypyVm8ZgakRoZwUmeg_vcII2a_w",
  authDomain: "guia-tiss.firebaseapp.com",
  projectId: "guia-tiss",
  storageBucket: "guia-tiss.firebasestorage.app",
  messagingSenderId: "451334655357",
  appId: "1:451334655357:web:82dbc02290eebfcaf01014"
}

// Versão dos Termos de uso (termos.html). Ao subir a versão, cada cliente aceita de novo na próxima entrada.
const TERMOS_VERSAO = '1.0'

// Aviso por e-mail quando alguém cria conta. Vai só o aviso, sem nome nem e-mail do cliente:
// os dados da conta ficam no painel (admin.html). Vazio = sem e-mail.
const AVISO_NOVA_CONTA_URL = 'https://formsubmit.co/ajax/remasolfaturetiss@gmail.com'

// Dias de teste grátis contados a partir da criação da conta.
const DIAS_TESTE = 30

// E-mails que entram no painel da Remasol (admin.html), onde você define o plano e o
// valor do serviço Faturista de cada cliente. Precisa ser igual à lista em firestore.rules.
const ADMIN_EMAILS = ['remasolfaturetiss@gmail.com']
