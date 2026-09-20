import { useState, useEffect } from 'react'
import './App.css'
import { visibleRows } from './views'

const BLANK_FORM = {
  inventory_key: '',
  name: '',
  category: '',
  package: '',
  in_stock: 0,
  location: '',
  manufacturer_nr: ''
}

function App() {
  const [components, setComponents] = useState([])
  const [categories, setCategories] = useState([])
  const [packages, setPackages] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newPackage, setNewPackage] = useState('')
  const [form, setForm] = useState(BLANK_FORM)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [suggestedComponents, setSuggestedComponents] = useState([])
  const [showSuggested, setShowSuggested] = useState(false)
  const [showUseModal, setShowUseModal] = useState(null)
  const [useAmount, setUseAmount] = useState('')
  const [showReportRealModal, setShowReportRealModal] = useState(null)
  const [reportRealAmount, setReportRealAmount] = useState('')
  const [filterZeroStock, setFilterZeroStock] = useState(true)
  const [view, setView] = useState('all')
  const [lowThreshold, setLowThreshold] = useState(5)
  const [reports, setReports] = useState([])

  const API = 'http://localhost:3001/api'

  // Categories, packages and suggestions don't depend on the search box.
  useEffect(() => {
    loadLists()
    fetchSuggestedComponents()
  }, [])

  // Debounced: typing used to fire a request per keystroke, per list.
  useEffect(() => {
    const t = setTimeout(fetchComponents, 250)
    return () => clearTimeout(t)
  }, [search, categoryFilter])

  async function loadLists() {
    try {
      const [catRes, pkgRes] = await Promise.all([
        fetch(`${API}/categories`),
        fetch(`${API}/packages`)
      ])
      setCategories(await catRes.json())
      setPackages(await pkgRes.json())
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchComponents() {
    try {
      const params = new URLSearchParams({ search })
      if (categoryFilter) params.set('category', categoryFilter)
      const res = await fetch(`${API}/components?${params}`)
      setComponents(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchSuggestedComponents() {
    try {
      const res = await fetch(`${API}/suggested_components`)
      setSuggestedComponents(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  const fetchReports = async (pw) => {
    try {
      const res = await fetch(`${API}/reports`, { headers: { 'x-admin-password': pw } })
      if (!res.ok) return alert('Could not load reports')
      setReports(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (!newCategory.trim()) return
    try {
      await fetch(`${API}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategory })
      })
      setNewCategory('')
      loadLists()
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddPackage = async (e) => {
    e.preventDefault()
    if (!newPackage.trim()) return
    try {
      await fetch(`${API}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPackage })
      })
      setNewPackage('')
      loadLists()
    } catch (err) {
      console.error(err)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!adminPw) return setShowPasswordModal(true)
    saveComponent(adminPw)
  }

  const saveComponent = async (pw) => {
    try {
      const res = await fetch(`${API}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify(form)
      })
      if (!res.ok) return alert('Save failed')
      setForm(BLANK_FORM)
      setShowForm(false)
      fetchComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSuggest = async (e) => {
    e.preventDefault()
    try {
      await fetch(`${API}/suggested_components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      setForm(BLANK_FORM)
      setShowForm(false)
      fetchSuggestedComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleUnlock = async (password) => {
    try {
      const res = await fetch(`${API}/admin/check`, { headers: { 'x-admin-password': password } })
      if (!res.ok) {
        alert('Incorrect password')
        setPasswordInput('')
        return
      }
      setAdminPw(password)
      setShowPasswordModal(false)
      setPasswordInput('')
      if (showForm) saveComponent(password)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDelete = async (key, name) => {
    if (!confirm(`Delete "${name}" (${key})? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API}/components/${key}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPw }
      })
      if (!res.ok) return alert('Delete failed')
      fetchComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleApprove = async (key) => {
    try {
      const res = await fetch(`${API}/suggested_components/${key}/approve`, {
        method: 'POST',
        headers: { 'x-admin-password': adminPw }
      })
      if (!res.ok) return alert('Approve failed — inventory key may already exist')
      fetchComponents()
      fetchSuggestedComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleReject = async (key, name) => {
    if (!confirm(`Reject suggestion "${name}"?`)) return
    try {
      const res = await fetch(`${API}/suggested_components/${key}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPw }
      })
      if (!res.ok) return alert('Reject failed')
      fetchSuggestedComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleReport = async (inventory_key, report_type) => {
    try {
      await fetch(`${API}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_key, report_type })
      })
      fetchComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleUse = async (inventory_key, action) => {
    if (!useAmount || isNaN(useAmount)) return
    try {
      const res = await fetch(`${API}/components/${inventory_key}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseInt(useAmount), action })
      })
      if (!res.ok) return alert('Could not update stock')
      setShowUseModal(null)
      setUseAmount('')
      fetchComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const handleReportReal = async (inventory_key) => {
    if (!reportRealAmount || isNaN(reportRealAmount)) return
    try {
      await fetch(`${API}/components/${inventory_key}/report-real`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported_number: parseInt(reportRealAmount) })
      })
      setShowReportRealModal(null)
      setReportRealAmount('')
      fetchComponents()
    } catch (err) {
      console.error(err)
    }
  }

  const rows = visibleRows(components, view, lowThreshold, filterZeroStock)

  const suggestedRows =
    view === 'suggested' || (view === 'all' && showSuggested) ? suggestedComponents : []

  const changeView = (next) => {
    setView(next)
    if (next === 'reports') fetchReports(adminPw)
  }

  return (
    <div className="app">
      <h1>Lab Component Database</h1>

      <div className="toolbar">
        <div className="toolbar-group">
          <input
            className="search"
            type="text"
            placeholder="Search by name or inventory key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <button
            className={showForm ? 'btn' : 'btn btn-primary'}
            onClick={() => {
              // fresh key and blank fields each time it opens, not a stale carry-over
              if (!showForm) setForm({ ...BLANK_FORM, inventory_key: Math.random().toString(36).slice(2, 11) })
              setShowForm(!showForm)
            }}
          >
            {showForm ? 'Cancel' : 'Add Component'}
          </button>
        </div>
        <div className="toolbar-group">
          {view === 'all' && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showSuggested}
                  onChange={(e) => setShowSuggested(e.target.checked)}
                />
                Show Suggested Parts
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={filterZeroStock}
                  onChange={(e) => setFilterZeroStock(e.target.checked)}
                />
                Out of stock
              </label>
            </>
          )}
          {adminPw && (
            <>
              <select className="view-select" value={view} onChange={(e) => changeView(e.target.value)}>
                <option value="all">All components</option>
                <option value="out">Out of stock only</option>
                <option value="low">Low on parts</option>
                <option value="suggested">Suggested parts</option>
                <option value="reports">Reports</option>
              </select>
              {view === 'low' && (
                <label className="check">
                  ≤
                  <input
                    type="number"
                    min="0"
                    className="threshold"
                    value={lowThreshold}
                    onChange={(e) => setLowThreshold(Number(e.target.value))}
                  />
                  in stock
                </label>
              )}
            </>
          )}
          {adminPw ? (
            <button className="btn btn-admin" onClick={() => { setAdminPw(''); setView('all') }} title="Lock admin mode">
              Admin on — lock
            </button>
          ) : (
            <button className="btn" onClick={() => setShowPasswordModal(true)}>
              Admin
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="panel">
          <form onSubmit={handleAdd}>
            <div className="field">
              <label>Inventory Key *</label>
              <input required value={form.inventory_key} readOnly />
            </div>
            <div className="field">
              <label>Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Category *</label>
              <select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Select Category</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <div className="field-add">
                <input type="text" placeholder="New category..." value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                <button type="button" className="btn btn-sm" onClick={handleAddCategory}>Add</button>
              </div>
            </div>
            <div className="field">
              <label>Package</label>
              <select value={form.package} onChange={(e) => setForm({ ...form, package: e.target.value })}>
                <option value="">Select Package</option>
                {packages.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <div className="field-add">
                <input type="text" placeholder="New package..." value={newPackage} onChange={(e) => setNewPackage(e.target.value)} />
                <button type="button" className="btn btn-sm" onClick={handleAddPackage}>Add</button>
              </div>
            </div>
            <div className="field">
              <label>In Stock</label>
              <input type="number" value={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: parseInt(e.target.value) })} />
            </div>
            <div className="field">
              <label>Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="field">
              <label>Manufacturer Number</label>
              <input value={form.manufacturer_nr} onChange={(e) => setForm({ ...form, manufacturer_nr: e.target.value })} />
            </div>
            <div className="actions">
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-ok" onClick={handleSuggest}>Suggest</button>
            </div>
          </form>
        </div>
      )}

      {showPasswordModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Admin Password</h2>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter password"
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock(passwordInput)}
            />
            <div className="actions">
              <button className="btn" onClick={() => { setShowPasswordModal(false); setPasswordInput(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleUnlock(passwordInput)}>Unlock</button>
            </div>
          </div>
        </div>
      )}

      {showUseModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Use Component</h2>
            <input
              type="number"
              autoFocus
              value={useAmount}
              onChange={(e) => setUseAmount(e.target.value)}
              placeholder="Amount"
              min="0"
            />
            <div className="actions">
              <button className="btn" onClick={() => { setShowUseModal(null); setUseAmount(''); }}>Cancel</button>
              <button className="btn btn-warn" onClick={() => handleUse(showUseModal, 'take')}>Take</button>
              <button className="btn btn-ok" onClick={() => handleUse(showUseModal, 'return')}>Return</button>
            </div>
          </div>
        </div>
      )}

      {showReportRealModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Report Real Number</h2>
            <input
              type="number"
              autoFocus
              value={reportRealAmount}
              onChange={(e) => setReportRealAmount(e.target.value)}
              placeholder="Actual quantity"
              min="0"
            />
            <div className="actions">
              <button className="btn" onClick={() => { setShowReportRealModal(null); setReportRealAmount(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleReportReal(showReportRealModal)}>Report</button>
            </div>
          </div>
        </div>
      )}

      {view === 'reports' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Inventory Key</th>
                <th>Name</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.timestamp}</td>
                  <td className="mono">{r.inventory_key}</td>
                  <td className="name">{r.name || '— deleted —'}</td>
                  <td>{r.report_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && <p className="empty">No reports filed.</p>}
        </div>
      ) : (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Inventory Key</th>
              <th>Name</th>
              <th>Category</th>
              <th>Package</th>
              <th style={{ textAlign: 'right' }}>In Stock</th>
              <th>Location</th>
              <th>Manufacturer Nr</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((comp) => (
              <tr key={comp.inventory_key} className={comp.in_stock === 0 ? 'is-empty' : undefined}>
                <td className="mono">{comp.inventory_key}</td>
                <td className="name">{comp.name}</td>
                <td>{comp.category}</td>
                <td>{comp.package}</td>
                <td className="num">{comp.in_stock}</td>
                <td>{comp.location}</td>
                <td className="mono">{comp.manufacturer_nr}</td>
                <td>
                  <div className="cell-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => setShowUseModal(showUseModal === comp.inventory_key ? null : comp.inventory_key)}>Use</button>
                    <select
                      className="report-select"
                      value=""
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'real') setShowReportRealModal(comp.inventory_key)
                        else if (v) handleReport(comp.inventory_key, v)
                      }}
                    >
                      <option value="">Report…</option>
                      <option value="Not in place">Not in place</option>
                      <option value="Not in stock">Not in stock</option>
                      <option value="Low on stock">Low on stock</option>
                      <option value="Wrong parts">Wrong parts</option>
                      <option value="real">Report real number</option>
                    </select>
                    {adminPw && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(comp.inventory_key, comp.name)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {suggestedRows.map((comp) => (
              <tr key={comp.inventory_key} className={comp.in_stock === 0 ? 'is-empty' : 'is-suggested'}>
                <td className="mono">{comp.inventory_key}</td>
                <td className="name">{comp.name}</td>
                <td>{comp.category}</td>
                <td>{comp.package}</td>
                <td className="num">{comp.in_stock}</td>
                <td>{comp.location}</td>
                <td className="mono">{comp.manufacturer_nr}</td>
                <td>
                  {adminPw ? (
                    <div className="cell-actions">
                      <button className="btn btn-sm btn-ok" onClick={() => handleApprove(comp.inventory_key)}>Approve</button>
                      <button className="btn btn-sm" onClick={() => handleReject(comp.inventory_key, comp.name)}>Reject</button>
                    </div>
                  ) : (
                    <span className="tag">Suggested</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && suggestedRows.length === 0 && (
          <p className="empty">Nothing to show in this view.</p>
        )}
      </div>
      )}
    </div>
  )
}

export default App
