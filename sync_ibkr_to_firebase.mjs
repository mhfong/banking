import { readFileSync, writeFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore'

// This script reads the local ibkr_parsed.json (freshly updated by sync_ibkr_ci.mjs)
// and merges it with the existing data in Firestore to ensure we dont lose history.

const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY'

const fbApp = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const db = getFirestore(fbApp)

async function pushToFirebase() {
  try {
    const localData = JSON.parse(readFileSync('ibkr_parsed.json', 'utf8'))
    
    // 1. Fetch existing data from Firestore to merge
    console.log('Fetching remote data from Firestore for merging...')
    const docRef = doc(db, 'investment_data', 'latest')
    const snap = await getDoc(docRef)
    let remoteData = snap.exists() ? snap.data() : { dailyPnL: [], trades: [], summary: {} }

    // 2. Merge Daily PNL
    // Use a Map by date to deduplicate and ensure we keep all historical points
    const pnlMap = new Map()
    remoteData.dailyPnL?.forEach(d => pnlMap.set(d.date, d))
    localData.dailyPnL?.forEach(d => pnlMap.set(d.date, d))
    const mergedDailyPnL = Array.from(pnlMap.values()).sort((a,b) => a.date.localeCompare(b.date))

    // 3. Merge Trades
    const tradeKey = (t) => `${t.date}-${t.symbol}-${t.type}-${t.quantity}-${t.price}`
    const tradeMap = new Map()
    remoteData.trades?.forEach(t => tradeMap.set(tradeKey(t), t))
    localData.trades?.forEach(t => tradeMap.set(tradeKey(t), t))
    const mergedTrades = Array.from(tradeMap.values()).sort((a,b) => b.date.localeCompare(a.date))

    // 4. Final Merged Object
    const finalData = {
      ...localData,
      dailyPnL: mergedDailyPnL,
      trades: mergedTrades,
      lastSyncAt: new Date().toISOString()
    }

    console.log(`Pushing merged data to Firestore (${mergedDailyPnL.length} days, ${mergedTrades.length} trades)...`)
    await setDoc(docRef, finalData)
    console.log('Successfully pushed to Firebase.')
    
    // Clear the sensitive files for repository safety
    const emptyData = { 
      summary: { totalPnL: 0, totalReturn: 0 }, 
      dailyPnL: [], 
      trades: [], 
      lastSyncAt: finalData.lastSyncAt 
    }
    writeFileSync('ibkr_parsed.json', JSON.stringify(emptyData, null, 2))
    writeFileSync('src/data/ibkr_parsed.json', JSON.stringify(emptyData))
    console.log('Local sensitive data cleared.')
    
  } catch (err) {
    console.error('Error merging and pushing to Firebase:', err)
    process.exit(1)
  }
}

pushToFirebase()
