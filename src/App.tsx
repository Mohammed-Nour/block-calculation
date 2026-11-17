import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Mix = { id: 'Mix 1' | 'Mix 2' | 'Mix 3' | 'Mix 4'; sand: number; stone: number; cement: number; strength: string }

const mixes: Mix[] = [
  { id: 'Mix 1', sand: 3, stone: 0, cement: 1, strength: '4.8 MPa' },
  { id: 'Mix 2', sand: 3, stone: 2, cement: 1, strength: '5.2 MPa' },
  { id: 'Mix 3', sand: 2.5, stone: 2.5, cement: 1, strength: '6.2 MPa' },
  { id: 'Mix 4', sand: 2, stone: 2, cement: 1, strength: '7.6 MPa' },
]

const initialProjects = [
  { id: 'PR-024', name: 'School boundary wall', status: 'In production', ready: '19 Nov, 09:00', cost: '—' },
  { id: 'PR-023', name: 'Workshop extension', status: 'Draft', ready: 'Not planned', cost: '—' },
]

function App() {
  const [activeView, setActiveView] = useState<'projects' | 'settings'>('projects')
  const [selectedMix, setSelectedMix] = useState<Mix['id'] | ''>('')
  const [fullBlocks, setFullBlocks] = useState('')
  const [halfBlocks, setHalfBlocks] = useState('')
  const [notice, setNotice] = useState('')
  const selectedRecipe = useMemo(() => mixes.find((mix) => mix.id === selectedMix), [selectedMix])

  function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMix) {
      setNotice('Choose a mix before you calculate or save this project.')
      return
    }
    if (Number(fullBlocks) + Number(halfBlocks) < 1) {
      setNotice('Enter at least one full or half block.')
      return
    }
    setNotice('Draft saved locally. Cost calculation will connect to the backend in the next milestone.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BlockCalc home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>BlockCalc</span></a>
        <nav aria-label="Main navigation">
          <button className={activeView === 'projects' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveView('projects')}>Projects</button>
          <button className={activeView === 'settings' ? 'nav-link active' : 'nav-link'} onClick={() => setActiveView('settings')}>Settings</button>
        </nav>
        <button className="quiet-button" onClick={() => setActiveView('settings')}>Check settings <span aria-hidden="true">→</span></button>
      </header>
      <main id="top">
        {activeView === 'projects' ? <ProjectsView fullBlocks={fullBlocks} halfBlocks={halfBlocks} notice={notice} selectedMix={selectedMix} selectedRecipe={selectedRecipe} setFullBlocks={setFullBlocks} setHalfBlocks={setHalfBlocks} setNotice={setNotice} setSelectedMix={setSelectedMix} onSubmit={createDraft} /> : <SettingsView onBack={() => setActiveView('projects')} />}
      </main>
    </div>
  )
}

type ProjectsViewProps = {
  fullBlocks: string; halfBlocks: string; notice: string; selectedMix: Mix['id'] | ''; selectedRecipe?: Mix
  setFullBlocks: (value: string) => void; setHalfBlocks: (value: string) => void; setNotice: (value: string) => void
  setSelectedMix: (value: Mix['id']) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function ProjectsView(props: ProjectsViewProps) {
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">Production planning</p><h1>Plan each batch<br /><em>before it is poured.</em></h1></div>
        <p className="heading-copy">Set a mix, check the molds, then save a clear material estimate for the project.</p>
      </section>
      <section className="status-strip" aria-label="Settings status">
        <span className="status-dot" aria-hidden="true" /><strong>Settings need one final check</strong><span>Enter measured sand and stone weights before material costs can be calculated.</span>
        <button onClick={() => document.getElementById('settings-note')?.scrollIntoView({ behavior: 'smooth' })}>Review inputs</button>
      </section>
      <section className="workspace-grid">
        <form className="project-card" onSubmit={props.onSubmit}>
          <div className="card-heading"><div><p className="eyebrow">New project</p><h2>Start a production plan</h2></div><span className="draft-label">Draft</span></div>
          <label className="field wide"><span>Project name</span><input defaultValue="New block order" aria-label="Project name" /></label>
          <div className="block-inputs">
            <label className="field"><span>Full blocks <small>400 × 200 × 200 mm</small></span><input type="number" min="0" placeholder="0" value={props.fullBlocks} onChange={(event) => props.setFullBlocks(event.target.value)} /></label>
            <label className="field"><span>Half blocks <small>200 × 200 × 200 mm</small></span><input type="number" min="0" placeholder="0" value={props.halfBlocks} onChange={(event) => props.setHalfBlocks(event.target.value)} /></label>
          </div>
          <fieldset className="mix-picker">
            <legend>Choose mix <span>Required before calculation</span></legend>
            <div className="mix-list">{mixes.map((mix) => (
              <label className={props.selectedMix === mix.id ? 'mix-choice selected' : 'mix-choice'} key={mix.id}>
                <input type="radio" name="mix" value={mix.id} checked={props.selectedMix === mix.id} onChange={() => { props.setSelectedMix(mix.id); props.setNotice('') }} />
                <span className="mix-code">{mix.id.replace('Mix ', '0')}</span><span><strong>{mix.strength}</strong><small>{mix.sand} sand · {mix.stone} stone · {mix.cement} cement</small></span>
              </label>
            ))}</div>
          </fieldset>
          {props.notice && <p className="form-notice" role="status">{props.notice}</p>}
          <div className="form-actions"><button type="button" className="secondary-button" onClick={() => props.setNotice('Draft remains open until you save it.')}>Save later</button><button type="submit" className="primary-button">Save draft <span aria-hidden="true">→</span></button></div>
        </form>
        <aside className="planning-card">
          <div className="card-heading"><div><p className="eyebrow">Mold capacity</p><h2>48-hour cycle</h2></div><span className="cycle-pill">per run</span></div>
          <p className="capacity-copy">Each mold produces one matching block. Full and half blocks are planned separately, then the later time becomes the expected ready time.</p>
          <div className="mold-board" aria-label="Example mold capacity">
            <div className="mold-row"><span>Full</span><div className="molds full-molds">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div><strong>6</strong></div>
            <div className="mold-row"><span>Half</span><div className="molds half-molds">{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div><strong>4</strong></div>
          </div>
          <div className="selected-mix-note"><span>Selected mix</span><strong>{props.selectedRecipe?.id ?? 'Choose a mix'}</strong><small>{props.selectedRecipe ? props.selectedRecipe.strength + ' target strength' : 'Material calculation stays locked until selected.'}</small></div>
        </aside>
      </section>
      <section className="projects-section">
        <div className="section-title"><div><p className="eyebrow">Project register</p><h2>Recent work</h2></div><button className="text-button">View all projects <span aria-hidden="true">→</span></button></div>
        <div className="project-table" role="table" aria-label="Recent projects"><div className="table-head" role="row"><span>Project</span><span>Status</span><span>Expected ready</span><span>Material cost</span></div>
          {initialProjects.map((project) => <div className="table-row" role="row" key={project.id}><span><strong>{project.name}</strong><small>{project.id}</small></span><span><b className={project.status === 'In production' ? 'status-badge working' : 'status-badge'}>{project.status}</b></span><span>{project.ready}</span><span>{project.cost}</span></div>)}
        </div>
      </section>
    </>
  )
}

function SettingsView({ onBack }: { onBack: () => void }) {
  return (
    <section className="settings-page" id="settings-note">
      <button className="back-button" onClick={onBack}>← Back to projects</button><p className="eyebrow">Settings</p><h1>Inputs that make<br /><em>the estimate reliable.</em></h1>
      <p className="settings-intro">Prices are stored per metric ton. You can change them at any time, and saved project estimates keep the prices that were used.</p>
      <div className="settings-grid">
        <section className="settings-card"><h2>Material prices</h2><p>Set the current price per metric ton.</p><div className="settings-fields"><label>Sand <input placeholder="Price per ton" inputMode="decimal" /><small>RUB / ton</small></label><label>13 mm stone <input placeholder="Price per ton" inputMode="decimal" /><small>RUB / ton</small></label><label>Cement <input placeholder="Price per ton" inputMode="decimal" /><small>RUB / ton</small></label></div></section>
        <section className="settings-card highlight"><h2>Required before costing</h2><p>Measure how many kilograms fit in your usual wheelbarrow. The system cannot safely turn wheelbarrows into tons without these values.</p><div className="settings-fields"><label>Sand weight <input placeholder="kg per wheelbarrow" inputMode="decimal" /><small>kg / wheelbarrow</small></label><label>Stone weight <input placeholder="kg per wheelbarrow" inputMode="decimal" /><small>kg / wheelbarrow</small></label></div></section>
      </div>
    </section>
  )
}

export default App
