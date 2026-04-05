import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, Timestamp
} from 'firebase/firestore'
import { format } from 'date-fns'
import '../styles/transactions.css'

const CATEGORIES = {
  income: ['Salary', 'Freelance', 'Investment', 'Other Income'],
  expense: ['Food', 'Transport', 'Housing', 'Entertainment', 'Shopping', 'Bills', 'Health', 'Other']
}

export default function Transactions() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate()
      })))
    })
    return unsubscribe
  }, [user])

  useEffect(() => {
    setCategory(CATEGORIES[type][0])
  }, [type])

  async function handleAdd(e) {
    e.preventDefault()
    if (!amount || !description) return
    setLoading(true)
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        type,
        amount: parseFloat(amount),
        description,
        category,
        date: Timestamp.fromDate(new Date(date + 'T12:00:00')),
        createdAt: Timestamp.now()
      })
      setAmount('')
      setDescription('')
      setShowForm(false)
    } catch (err) {
      alert('Error adding transaction: ' + err.message)
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this transaction?')) return
    try {
      await deleteDoc(doc(db, 'transactions', id))
    } catch (err) {
      alert('Error deleting: ' + err.message)
    }
  }

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter)

  return (
    <div className="transactions-page">
      <div className="transactions-header">
        <h1>Transactions</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><i className="fas fa-times"></i> Cancel</> : <><i className="fas fa-plus"></i> Add Transaction</>}
        </button>
      </div>

      {showForm && (
        <div className="add-form-card">
          <form onSubmit={handleAdd}>
            <div className="type-toggle">
              <button
                type="button"
                className={`toggle-btn ${type === 'expense' ? 'active-expense' : ''}`}
                onClick={() => setType('expense')}
              >
                Expense
              </button>
              <button
                type="button"
                className={`toggle-btn ${type === 'income' ? 'active-income' : ''}`}
                onClick={() => setType('income')}
              >
                Income
              </button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What was this for?"
                  required
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES[type].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Adding...' : `Add ${type === 'income' ? 'Income' : 'Expense'}`}
            </button>
          </form>
        </div>
      )}

      <div className="filter-bar">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'income' ? 'active' : ''} onClick={() => setFilter('income')}>Income</button>
        <button className={filter === 'expense' ? 'active' : ''} onClick={() => setFilter('expense')}>Expenses</button>
      </div>

      <div className="transactions-list">
        {filtered.length > 0 ? (
          filtered.map(t => (
            <div key={t.id} className={`transaction-item ${t.type}`}>
              <div className="transaction-info">
                <span className="transaction-desc">{t.description}</span>
                <span className="transaction-meta">
                  {format(t.date, 'MMM dd, yyyy')} • {t.category}
                </span>
              </div>
              <div className="transaction-right">
                <span className={`transaction-amount ${t.type}`}>
                  {t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <button className="btn-delete" onClick={() => handleDelete(t.id)}><i className="fas fa-trash-alt"></i></button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p><i className="fas fa-inbox"></i> No transactions found</p>
          </div>
        )}
      </div>
    </div>
  )
}
