// Clean + Resync IBKR deposits from investment_data
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, getDoc, writeBatch } from 'firebase/firestore'

const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY'
const OWNER_UID = '0G3jUSlKzQbzOrbD1cY0ari1Y4i1'

const fbApp = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const fireDb = getFirestore(fbApp)

async function main() {
  console.log('[RESYNC] Starting IBKR transaction cleanup & resync...')
  
  // Step 1: Delete all Investment transactions
  console.log('[RESYNC] Deleting all Investment category transactions...')
  const snap = await getDocs(collection(fireDb, 'transactions'))
  const investmentDocs = snap.docs.filter(d => d.data().category === 'Investment')
  console.log(`Found ${investmentDocs.length} Investment transactions`)
  
  let deleted = 0
  for (let i = 0; i < investmentDocs.length; i += 400) {
    const batch = writeBatch(fireDb)
    investmentDocs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
    deleted += investmentDocs.slice(i, i + 400).length
  }
  console.log(`[RESYNC] Deleted ${deleted} Investment transactions`)
  
  // Step 2: Fetch investment_data/latest from Firebase
  console.log('[RESYNC] Fetching investment data from Firestore...')
  const investDoc = await getDoc(doc(fireDb, 'investment_data', 'latest'))
  if (!investDoc.exists()) {
    console.error('[RESYNC] No investment_data/latest found!')
    process.exit(1)
  }
  
  const investData = investDoc.data()
  const deposits = investData.deposits || []
  console.log(`[RESYNC] Found ${deposits.length} deposits in investment_data`)
  
  // Step 3: Add deposits back as transactions
  console.log('[RESYNC] Re-adding IBKR deposits to transactions...')
  const { Timestamp } = await import('firebase/firestore')
  
  const newTxns = []
  for (const d of deposits) {
    const type = d.amount > 0 ? 'expense' : 'income'  // Deposit = cash out (expense), Withdrawal = cash in (income)
    newTxns.push({
      date: d.date,
      description: 'IBKR ' + (d.amount > 0 ? 'Deposit' : 'Withdrawal'),
      amount: Math.abs(d.amount),
      type: type,
      category: 'Investment',
      paymentMethod: 'IBKR',
      createdAt: Timestamp.fromDate(new Date(d.date + 'T00:00:00')),
      userId: OWNER_UID,
      excludeFromChart: true
    })
  }
  
  // Batch write
  let added = 0
  for (let i = 0; i < newTxns.length; i += 400) {
    const batch = writeBatch(fireDb)
    newTxns.slice(i, i + 400).forEach(t => {
      batch.set(doc(collection(fireDb, 'transactions')), t)
    })
    await batch.commit()
    added += newTxns.slice(i, i + 400).length
  }
  
  console.log(`[RESYNC] Added ${added} IBKR deposits back to transactions`)
  console.log('[RESYNC] Complete!')
}

main().catch(e => {
  console.error('[RESYNC] Error:', e.message)
  process.exit(1)
})
