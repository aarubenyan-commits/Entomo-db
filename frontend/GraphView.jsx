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
        nodes.push({ id: p.guid, name: p.display_name, type: 'person', group: 1 });
        nodeMap.set(p.guid, true);
      });

      taxaRes.data.forEach(t => {
        nodes.push({ id: t.guid, name: t.display_name, type: 'taxon', group: 3, genus: t.genus, species: t.species, subspecies: t.subspecies });
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
              date: p.date_text || 'дата не указана'
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
                description: 'Содержит таксон'
              });
            }
          });
        } catch (error) {}
      }

      setGraphData({ nodes, links });
    } catch (error) {
      console.error('Ошибка загрузки данных для графа:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    try {
      const response = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchTerm)}`);
      const results = response.data;
      const flatRows = [];
      
      for (const result of results) {
        const nodeLinks = graphData.links.filter(link => 
          link.source.id === result.guid || link.target.id === result.guid
        );
        
        if (nodeLinks.length === 0) {
          flatRows.push({
            source_guid: result.guid,
            source_name: result.name,
            source_type: result.type,
            link_type: null,
            link_description: null,
            target_name: null,
            target_type: null
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
              link_type: link.type,
              link_description: link.description,
              link_date: link.date,
              target_name: targetNode?.name || 'Неизвестно',
              target_type: targetNode?.type || 'unknown',
              direction: isSource ? '→ исходящая' : '← входящая'
            });
          }
        }
      }
      
      setFlatTableData(flatRows);
      setFilteredData([]);
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
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
                <th style={{ padding: '8px', borderRight: '1px solid #d0d0d0', width: '30%' }}>Объект</th>
                <th style={{ padding: '8px', borderRight: '1px solid #d0d0d0', width: '40%' }}>Связь</th>
                <th style={{ padding: '8px', width: '30%' }}>Связан с</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((row, idx) => (
                <tr 
                  key={idx}
                  onClick={() => handleRowClick(row)}
                  style={{ 
                    cursor: 'pointer', 
                    backgroundColor: selectedNodeId === row.source_guid ? '#e3f2fd' : 'white',
                    borderBottom: '1px solid #e0e0e0'
                  }}
                >
                  <td style={{ padding: '8px', borderRight: '1px solid #e0e0e0', verticalAlign: 'top' }}>
                    <strong>{row.source_name}</strong>
                    <div style={{ fontSize: '10px', color: '#666' }}>({row.source_type})</div>
                  </td>
                  <td style={{ padding: '8px', borderRight: '1px solid #e0e0e0', verticalAlign: 'top' }}>
                    {row.link_type ? (
                      <div>
                        <div>{row.link_description || row.link_type}</div>
                        {row.link_date && <div style={{ fontSize: '10px', color: '#666' }}>📅 {row.link_date}</div>}
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '3px' }}>{row.direction}</div>
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>Нет связей</span>
                    )}
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    {row.target_name ? (
                      <>
                        <strong>{row.target_name}</strong>
                        <div style={{ fontSize: '10px', color: '#666' }}>({row.target_type})</div>
                      </>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
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

      <div style={{ height: `${100 - tableHeight}%`, position: 'relative', background: '#1a1a2e' }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={node => node.group === 1 ? '#3498db' : node.group === 2 ? '#2ecc71' : '#9b59b6'}
          nodeVal={node => node.type === 'point' ? 3 : 5}
          onNodeClick={handleGraphNodeClick}
          cooldownTicks={100}
          onEngineStop={() => fgRef.current?.zoomToFit(400)}
          backgroundColor="#1a1a2e"
        />
      </div>
    </div>
  );
};

export default GraphView;
