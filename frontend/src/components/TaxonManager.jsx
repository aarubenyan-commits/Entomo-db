import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const API_URL = 'http://127.0.0.1:8000';

const TaxonManager = ({ pointGuid, onClose }) => {
  const [linkedTaxa, setLinkedTaxa] = useState([]);
  const [allTaxa, setAllTaxa] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [newGenus, setNewGenus] = useState('');
  const [newSpecies, setNewSpecies] = useState('');

  const loadData = async () => {
    const [pointTaxaRes, allTaxaRes] = await Promise.all([
      axios.get(`${API_URL}/point_taxa/${pointGuid}`),
      axios.get(`${API_URL}/taxa`)
    ]);
    setLinkedTaxa(pointTaxaRes.data);
    setAllTaxa(allTaxaRes.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelect = async (selected) => {
    if (!selected) return;
    await axios.post(`${API_URL}/point_taxa/${pointGuid}/${selected.value}`);
    loadData();
    setSelectedOption(null);
  };

  const handleCreateNew = async () => {
    if (!newGenus.trim()) return;
    const res = await axios.post(`${API_URL}/taxa?genus=${encodeURIComponent(newGenus)}&species=${encodeURIComponent(newSpecies)}`);
    const newTaxon = res.data;
    await axios.post(`${API_URL}/point_taxa/${pointGuid}/${newTaxon.guid}`);
    loadData();
    setNewGenus('');
    setNewSpecies('');
  };

  const handleUnlink = async (taxonGuid) => {
    await axios.delete(`${API_URL}/point_taxa/${pointGuid}/${taxonGuid}`);
    loadData();
  };

  const options = allTaxa
    .filter(t => !linkedTaxa.some(lt => lt.guid === t.guid))
    .map(t => ({ value: t.guid, label: `${t.genus} ${t.species || ''}` }));

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
        <h3>Таксоны в этой точке</h3>
        <ul>
          {linkedTaxa.map(t => (
            <li key={t.guid}>
              {t.genus} {t.species || ''}
              <button onClick={() => handleUnlink(t.guid)} style={{ marginLeft: '10px', color: 'red' }}>✖</button>
            </li>
          ))}
        </ul>
        <hr />
        <h4>Добавить новый таксон</h4>
        <div>
          <input type="text" placeholder="Род" value={newGenus} onChange={e => setNewGenus(e.target.value)} />
          <input type="text" placeholder="Вид (опционально)" value={newSpecies} onChange={e => setNewSpecies(e.target.value)} />
          <button onClick={handleCreateNew}>➕ Добавить</button>
        </div>
        <hr />
        <h4>Привязать существующий</h4>
        <Select
          options={options}
          value={selectedOption}
          onChange={handleSelect}
          placeholder="Начните вводить род или вид..."
          isClearable
        />
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};

export default TaxonManager;
