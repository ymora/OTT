// Patch pour ajouter le mode simple au dashboard
// À ajouter dans components/configuration/UsbStreamingTab.js

// 1. Ajouter cet import en haut du fichier:
// import SimpleUsbConnector from '@/components/SimpleUsbConnector'

// 2. Ajouter cet état dans la section des états:
// const [simpleMode, setSimpleMode] = useState(false)

// 3. Ajouter ce connecteur simplifié dans la section des connecteurs:
// const simpleConnector = SimpleUsbConnector({
//   onConnect: (port, reader, writer) => {
//     addLog('✅ Connecté avec le connecteur simplifié!', 'success')
//     // Traiter les données comme le mode normal
//     const handleData = (data) => {
//       appendUsbStreamLog(data, 'device')
//     }
//     
//     // Configurer le callback de données
//     const originalRead = reader.read
//     reader.read = async () => {
//       const result = await originalRead()
//       if (result.value) {
//         const text = new TextDecoder().decode(result.value)
//         handleData(text)
//       }
//       return result
//     }
//   },
//   onData: (data) => {
//     appendUsbStreamLog(data, 'device')
//   }
// })

// 4. Utiliser le connecteur simplifié dans handleConnect:
// const handleConnect = async () => {
//   if (simpleMode) {
//     const success = simpleConnector.connectDirect()
//     if (success) {
//       appendUsbStreamLog('✅ Connecté avec le connecteur simplifié!', 'dashboard')
//     }
//     return
//   }
//   // ... reste du code existant
// }

// 5. Ajouter le bouton dans l'interface:
// <button
//   onClick={() => setSimpleMode(!simpleMode)}
//   className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
//     simpleMode 
//       ? 'bg-blue-600 text-white hover:bg-blue-700' 
//       : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
//   }`}
// >
//   {simpleMode ? 'Mode Normal' : 'Mode Simple'}
// </button>

console.log('Patch créé pour le mode simple USB')
