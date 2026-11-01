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
const FIREBASE_CONFIG = null

// Dias de teste grátis contados a partir da criação da conta.
const DIAS_TESTE = 7
