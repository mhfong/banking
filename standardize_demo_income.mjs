// Standardize income transactions to 30,000 per month
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc, updateDoc } from 'firebase/firestore'

const DEMO_UID = 'KHEpex9lWFZn7JVNkEHmW2orNDn1'
const fbApp = initializeApp({
  apiKey: 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY',
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const db = getFirestore(fbApp)

async function main() {
  console.log(`[INCOME] Standardizing income for UID: ${DEMO_UID}`)
  
  // Get all income transactions
  const snap = await getDocs(collection(db, 'transactions'))
  const incomes = snap.docs.filter(d => d.data().userId === DEMO_UID && d.data().type === 'income')
  console.log(`Found ${incomes.length} income transactions`)
  
  // Group by month
  const byMonth = {}
  incomes.forEach(doc => {
    const month = doc.data().date.substring(0, 7) // YYYY-MM
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(doc)
  })
  
  console.log(`Grouped into ${Object.keys(byMonth).length} months`)
  
  // For each month, keep only first income and set to 30000
  let updated = 0
  let deleted = 0
  
  for (const [month, docs] of Object.entries(byMonth)) {
    console.log(`  ${month}: ${docs.length} incomes`)
    
    // Keep first, delete rest
    for (let i = 0; i < docs.length; i++) {
      if (i === 0) {
        // Update first to 30000
        await updateDoc(docs[i].ref, { amount: 30000 })
        updated++
      } else {
        // Delete rest
        const batch = writeBatch(db)
        batch.delete(docs[i].ref)
        await batch.commit()
        deleted++
      }
    }
  }
  
  console.log(`[INCOME] Done!`)
  console.log(`  Updated: ${updated} (set to 30,000)`)
  console.log(`  Deleted: ${deleted} (extra incomes)`)
}

main().catch(e => { console.error(e); process.exit(1) })
