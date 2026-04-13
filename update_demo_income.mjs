// Change all monthly income to 40,000
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, updateDoc } from 'firebase/firestore'

const DEMO_UID = 'KHEpex9lWFZn7JVNkEHmW2orNDn1'
const fbApp = initializeApp({
  apiKey: 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY',
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const db = getFirestore(fbApp)

async function main() {
  console.log(`[INCOME] Updating all income to 40,000...`)
  
  const snap = await getDocs(collection(db, 'transactions'))
  const incomes = snap.docs.filter(d => d.data().userId === DEMO_UID && d.data().type === 'income')
  
  let updated = 0
  for (const doc of incomes) {
    await updateDoc(doc.ref, { amount: 40000 })
    updated++
  }
  
  console.log(`[INCOME] Updated ${updated} income transactions to $40,000`)
}

main().catch(e => { console.error(e); process.exit(1) })
