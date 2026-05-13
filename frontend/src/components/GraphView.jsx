import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const GraphView = ({ onUpdate, refreshTrigger }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [flatTableData, setFlatTableData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [tableHeight, setTableHeight] = useState(50);
  const [showFilterPopup, setShowFilterPopup] = useState({ column: null, open: false });
  const [activeFilters, setActiveFilters] = useState({ source: "", link: "", target: "" });
  const [filters, setFilters] = useState({
    source_genus: '',
    source_species: '',
    source_subspecies: '',
    link_type: '',
    target_genus: '',
    target_species: '',
    target_subspecies: ''
  });
  const [availableFilterValues, setAvailableFilterValues] = useState({
    source_genus: [],
    source_species: [],
    source_subspecies: [],
    link_type: [],
    target_genus: [],
    target_species: [],
    target_subspecies: []
  });
  const fgRef = useRef();
  const resizerRef = useRef();

  useEffect(() => {
    fetchGraphData();
  }, [refreshTrigger]);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      handleSearch();
    } else if (searchTerm.length === 0) {
      setFlatTableData([]);
      setFilteredData([]);
    }
  }, [searchTerm]);

useEffect(() => {
  applyFilters();
}, [flatTableData, activeFilters]);

  const fetchGraphData = async () => {
    try {
      const [pointsRes, personsRes, taxaRes] = await Promise.all([
        axios.get(`${API_URL}/points`),
        axios.get(`${API_URL}/persons`),
        axios.get(`${API_URL}/taxa`)
      ]);

      const nodes = [];
      const links = [];
      const nodeMap = new Map();

      personsRes.data.forEach(p => {
        nodes.push({ id: p.guid, name: p.display_name, type: 'person', group: 1, full_data: p });
        nodeMap.set(p.guid, true);
      });

      taxaRes.data.forEach(t => {
        nodes.push({ 
          id: t.guid, 
          name: t.display_name, 
          type: 'taxon', 
          group: 3, 
          full_data: t,
          genus: t.genus,
          species: t.species,
          subspecies: t.subspecies
        });
        nodeMap.set(t.guid, true);
      });

      pointsRes.data.forEach(p => {
        nodes.push({
          id: p.guid,
          name: p.location_original || p.display_date || 'Без названия',
          type: 'point',
          group: 2,
          latitude: p.latitude,
          longitude: p.longitude,
          full_data: p
        });
        nodeMap.set(p.guid, true);

        if (p.collector_name) {
          const personNode = personsRes.data.find(person => person.display_name === p.collector_name);
          if (personNode && nodeMap.has(personNode.guid)) {
            links.push({ 
              source: personNode.guid, 
              target: p.guid, 
              type: 'collected_at',
              description: 'Собрана',
              date: p.date_text || 'дата не указана',
              link_guid: `link_${personNode.guid}_${p.guid}`
            });
          }
        }
      });

      for (const point of pointsRes.data) {
        try {
          const taxaLinksRes = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
          taxaLinksRes.data.forEach(taxon => {
            if (nodeMap.has(taxon.guid)) {
              links.push({ 
                source: point.guid, 
                target: taxon.guid, 
                type: 'has_taxon',
                description: 'Содержит таксон',
                link_guid: `link_${point.guid}_${taxon.guid}`
              });
            }
          });
        } catch (error) {
          console.error('Ошибка загрузки таксонов для точки', point.guid);
        }
      }

      // Загружаем источники для точек
      const sourcesMap = new Map();
      for (const point of pointsRes.data) {
        try {
          const sourcesRes = await axios.get(`${API_URL}/sources/point/${point.guid}`);
          if (sourcesRes.data.length > 0) {
            sourcesMap.set(point.guid, sourcesRes.data);
          }
        } catch (error) {}
      }
      
      // Добавляем источники в узлы
      nodes.forEach(node => {
        if (node.type === "point" && sourcesMap.has(node.id)) {
          node.sources = sourcesMap.get(node.id);
        }
      });
      
      setGraphData({ nodes, links });
    } catch (error) {
      console.error('Ошибка загрузки данных для графа:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchTerm)}`);
      const results = response.data;
      
      const flatRows = [];
      
      for (const result of results) {
        const nodeLinks = graphData.links.filter(link => 
          link.source.id === result.guid || link.target.id === result.guid
        );
        
        const fullNode = graphData.nodes.find(n => n.id === result.guid);
        
        if (nodeLinks.length === 0) {
          flatRows.push({
            source_guid: result.guid,
            source_name: result.name,
            source_type: result.type,
            source_genus: fullNode?.genus || '',
            source_species: fullNode?.species || '',
            source_subspecies: fullNode?.subspecies || '',
            link_type: null,
            link_description: null,
            link_date: null,
            link_guid: null,
            target_guid: null,
            target_name: null,
            target_type: null,
            target_genus: '',
            target_species: '',
            target_subspecies: '',
            direction: null
          });
        } else {
          for (const link of nodeLinks) {
            const isSource = link.source.id === result.guid;
            const targetId = isSource ? link.target.id : link.source.id;
            const targetNode = graphData.nodes.find(n => n.id === targetId);
            
            flatRows.push({
              source_guid: result.guid,
              source_name: result.name,
              source_type: result.type,
              source_genus: fullNode?.genus || '',
              source_species: fullNode?.species || '',
              source_subspecies: fullNode?.subspecies || '',
              link_type: link.type,
              link_description: link.description,
              link_date: link.date,
              link_guid: link.link_guid,
              target_guid: targetId,
              target_name: targetNode?.name || 'Неизвестно',
              target_type: targetNode?.type || 'unknown',
              target_genus: targetNode?.genus || '',
              target_species: targetNode?.species || '',
              target_subspecies: targetNode?.subspecies || '',
              direction: isSource ? '→ исходящая' : '← входящая'
            });
          }
        }
      }
      
      setFlatTableData(flatRows);
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  };

  const updateAvailableFilterValues = () => {
    if (flatTableData.length === 0) return;
    
    setAvailableFilterValues({
      source_genus: [...new Set(flatTableData.map(r => r.source_genus).filter(Boolean))],
      source_species: [...new Set(flatTableData.map(r => r.source_species).filter(Boolean))],
      source_subspecies: [...new Set(flatTableData.map(r => r.source_subspecies).filter(Boolean))],
      link_type: [...new Set(flatTableData.map(r => r.link_type).filter(Boolean))],
      target_genus: [...new Set(flatTableData.map(r => r.target_genus).filter(Boolean))],
      target_species: [...new Set(flatTableData.map(r => r.target_species).filter(Boolean))],
      target_subspecies: [...new Set(flatTableData.map(r => r.target_subspecies).filter(Boolean))]
    });
  };

const applyFilters = () => {
  console.log('applyFilters called, activeFilters:', activeFilters);
  console.log('flatTableData length:', flatTableData.length);
  
  let filtered = [...flatTableData];
  
  // Применяем активные фильтры
  if (activeFilters.source) {
    console.log('Filtering by source:', activeFilters.source);
    filtered = filtered.filter(row => row.source_name === activeFilters.source);
  }
  if (activeFilters.link) {
    console.log('Filtering by link:', activeFilters.link);
    filtered = filtered.filter(row => (row.link_description || row.link_type) === activeFilters.link);
  }
  if (activeFilters.target) {
    console.log('Filtering by target:', activeFilters.target);
    filtered = filtered.filter(row => row.target_name === activeFilters.target);
  }
  
  console.log('Filtered data length:', filtered.length);
  setFilteredData(filtered);
};

  const handleFilterClick = (column, e) => {
    e.stopPropagation();
    
    let values = [];
    const displayData = filteredData.length > 0 ? filteredData : flatTableData;
    
    if (column === 'source_column') {
      values = [...new Set(displayData.map(row => row.source_name).filter(Boolean))];
    } else if (column === 'link_column') {
      values = [...new Set(displayData.map(row => row.link_description || row.link_type).filter(Boolean))];
    } else if (column === 'target_column') {
      values = [...new Set(displayData.map(row => row.target_name).filter(Boolean))];
    }
    
    setAvailableFilterValues({ ...availableFilterValues, current_column: values });
    setShowFilterPopup({ column, open: true, values });
  };

  const applyColumnFilter = (column, value) => {
    setFilters(prev => ({ ...prev, [column]: value }));
    setShowFilterPopup({ column: null, open: false });
  };

  const clearColumnFilter = (column) => {
    setFilters(prev => ({ ...prev, [column]: '' }));
    setShowFilterPopup({ column: null, open: false });
  };

  const handleRowClick = (row) => {
    if (row.source_guid) {
      setSelectedNodeId(row.source_guid);
      const node = graphData.nodes.find(n => n.id === row.source_guid);
      if (node && fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 1000);
        fgRef.current.zoom(2, 1000);
      }
    }
  };

  const handleGraphNodeClick = (node) => {
    setSelectedNodeId(node.id);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(2, 1000);
    }
  };

  const handleDeleteLink = async (row, e) => {
    e.stopPropagation();
    if (window.confirm('Удалить эту связь?')) {
      try {
        if (row.link_type === 'collected_at') {
          alert('Удаление связи сборщик-точка в разработке');
        } else {
          await axios.delete(`${API_URL}/point_taxa/${row.source_guid}/${row.target_guid}`);
        }
        fetchGraphData();
        handleSearch();
        alert('Связь удалена');
      } catch (error) {
        console.error('Ошибка удаления связи:', error);
        alert('Ошибка удаления связи');
      }
    }
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = tableHeight;
    
    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = startHeight + (delta / window.innerHeight) * 100;
      setTableHeight(Math.min(80, Math.max(20, newHeight)));
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };


const applyColumnFilterValue = (column, value) => {
  console.log('applyColumnFilterValue called:', column, value);
  if (!value) {
    // Сброс фильтра
    if (column === 'source_column') setActiveFilters(prev => ({ ...prev, source: "" }));
    else if (column === 'link_column') setActiveFilters(prev => ({ ...prev, link: "" }));
    else if (column === 'target_column') setActiveFilters(prev => ({ ...prev, target: "" }));
  } else {
    if (column === 'source_column') setActiveFilters(prev => ({ ...prev, source: value }));
    else if (column === 'link_column') setActiveFilters(prev => ({ ...prev, link: value }));
    else if (column === 'target_column') setActiveFilters(prev => ({ ...prev, target: value }));
  }
  setShowFilterPopup({ column: null, open: false });
};

  const renderFilterPopup = () => {
    if (!showFilterPopup.open) return null;
    
    const column = showFilterPopup.column;
    let values = [];
    let title = '';
    
    if (column === 'source_column') {
      values = availableFilterValues.current_column || [];
      title = 'Фильтр по объекту';
    } else if (column === 'link_column') {
      values = availableFilterValues.current_column || [];
      title = 'Фильтр по связи';
    } else if (column === 'target_column') {
      values = availableFilterValues.current_column || [];
      title = 'Фильтр по связанному объекту';
    } else {
      return null;
    }
    
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '15px',
        zIndex: 1000,
        boxShadow: '0 4px 20px rgba(203, 195, 195, 0.2)',
        minWidth: '200px'
      }}>
        <h4 style={{ margin: '0 0 10px 0' }}>{title}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflow: 'auto' }}>
          {values.map(value => (
            <button key={value} onClick={() => applyColumnFilterValue(column, value)} style={{ padding: '5px', textAlign: 'left', cursor: 'pointer' }}>
              {value}
            </button>
          ))}
          {values.length === 0 && <div>Нет доступных значений</div>}
          <hr />
          <button onClick={() => applyColumnFilterValue(column, null)} style={{ color: '#e74c3c' }}>Сбросить фильтр</button>
        </div>
        <button onClick={() => setShowFilterPopup({ column: null, open: false })} style={{ marginTop: '10px', padding: '5px 10px' }}>Закрыть</button>
      </div>
    );
  };

  const displayData = filteredData.length > 0 ? filteredData : flatTableData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div style={{ padding: '10px', background: 'white', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Поиск (минимум 2 символа)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>

      <div style={{ height: `${tableHeight}%`, overflow: 'auto', borderBottom: '1px solid #ddd', background: '#f9f9f9' }}>
        {displayData.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #d0d0d0' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0', zIndex: 10 }}>
              <tr style={{ borderBottom: '2px solid #a0a0a0' }}>
                <th style={{ padding: '8px', borderRight: '1px solid #d0d0d0', width: '30%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Объект</span>
                    <button onClick={(e) => handleFilterClick('source_column', e)} style={{ fontSize: '12px', cursor: 'pointer', padding: '2px 6px' }}>🔽 Фильтр</button>
                  </div>
                </th>
                <th style={{ padding: '8px', borderRight: '1px solid #d0d0d0', width: '40%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Связь</span>
                    <button onClick={(e) => handleFilterClick('link_column', e)} style={{ fontSize: '12px', cursor: 'pointer', padding: '2px 6px' }}>🔽 Фильтр</button>
                  </div>
                </th>
                <th style={{ padding: '8px', width: '30%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Связан с</span>
                    <button onClick={(e) => handleFilterClick('target_column', e)} style={{ fontSize: '12px', cursor: 'pointer', padding: '2px 6px' }}>🔽 Фильтр</button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((row, idx) => (
                <tr key={idx} onClick={() => handleRowClick(row)} style={{ backgroundColor: selectedNodeId === row.source_guid ? '#e3f2fd' : 'white', borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px', borderRight: '1px solid #e0e0e0', verticalAlign: 'top' }}>
                    <strong>{row.source_name}</strong>
                    <div style={{ fontSize: '10px', color: '#cecaca' }}>({row.source_type})</div>
                    {row.source_type === 'taxon' && row.source_genus && <div style={{ fontSize: '9px', color: '#888' }}>Род: {row.source_genus}</div>}
                    {row.source_type === 'taxon' && row.source_species && <div style={{ fontSize: '9px', color: '#888' }}>Вид: {row.source_species}</div>}
                  </td>
                  <td style={{ padding: '8px', borderRight: '1px solid #e0e0e0', verticalAlign: 'top' }}>
                    {row.link_type ? (
                      <div>
                        <div>{row.link_description || row.link_type}</div>
                        {row.link_date && <div style={{ fontSize: '10px', color: '#666' }}>📅 {row.link_date}</div>}
                        <div style={{ fontSize: '10px', color: '#888' }}>{row.direction}</div>
                        <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                          <button onClick={(e) => { e.stopPropagation(); alert('Редактирование в разработке'); }}>✏️</button>
                          <button onClick={(e) => handleDeleteLink(row, e)}>🗑️</button>
                        </div>
                      </div>
                    ) : <span style={{ color: '#999' }}>Нет связей</span>}
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    {row.target_name ? (
                      <>
                        <strong>{row.target_name}</strong>
                        <div style={{ fontSize: '10px', color: '#666' }}>({row.target_type})</div>
                        {row.target_type === 'taxon' && row.target_genus && <div style={{ fontSize: '9px', color: '#888' }}>Род: {row.target_genus}</div>}
                        {row.target_type === 'taxon' && row.target_species && <div style={{ fontSize: '9px', color: '#888' }}>Вид: {row.target_species}</div>}
                      </>
                    ) : <span style={{ color: '#999' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            {searchTerm ? 'Ничего не найдено' : 'Введите поисковый запрос (минимум 2 символа)'}
          </div>
        )}
      </div>

      <div ref={resizerRef} onMouseDown={handleResizeStart} style={{ height: '5px', background: '#ccc', cursor: 'ns-resize', flexShrink: 0 }} />

      <div style={{ height: `${100 - tableHeight}%`, position: 'relative', background: '#bcbcbd' }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeLabel={node => `${node.name}${node.sources && node.sources.length > 0 ? ` (📚 ${node.sources.length})` : ""}`}
          nodeColor={node => node.group === 1 ? '#3498db' : node.group === 2 ? '#2ecc71' : '#9b59b6'}
          nodeVal={node => node.type === 'point' ? 3 : 5}
          onNodeClick={handleGraphNodeClick}
          cooldownTicks={100}
          onEngineStop={() => fgRef.current?.zoomToFit(400)}
          backgroundColor="#d1dbe8"
        />
      </div>

      {renderFilterPopup()}
    </div>
  );
};

export default GraphView;
