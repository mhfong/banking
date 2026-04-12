// Delete all demo account transactions then recreate
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'

const DEMO_UID = 'KHEpex9lWFZn7JVNkEHmW2orNDn1'
const fbApp = initializeApp({
  apiKey: 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY',
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const db = getFirestore(fbApp)

async function main() {
  console.log('[CLEANUP] Deleting old demo transactions...')
  const snap = await getDocs(collection(db, 'transactions'))
  const demoDocs = snap.docs.filter(d => d.data().userId === DEMO_UID)
  console.log(`Found ${demoDocs.length} demo transactions`)
  
  for (let i = 0; i < demoDocs.length; i += 400) {
    const batch = writeBatch(db)
    demoDocs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  console.log('[CLEANUP] Deleted. Now run create_demo_data.mjs')
}

main().catch(e => { console.error(e); process.exit(1) })
