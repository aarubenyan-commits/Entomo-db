import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

const GraphView = ({ onUpdate, refreshTrigger }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [searchResults, setSearchResults] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [uniqueProperties, setUniqueProperties] = useState([]);
  const fgRef = useRef();

  useEffect(() => {
    fetchGraphData();
  }, [refreshTrigger]);

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
        const node = { 
          id: p.guid, 
          name: p.full_name, 
          type: 'person', 
          group: 1,
          full_data: p,
          properties: [`Сборщик: ${p.full_name}`]
        };
        nodes.push(node);
        nodeMap.set(p.guid, node);
      });

      taxaRes.data.forEach(t => {
        const node = { 
          id: t.guid, 
          name: t.full_name, 
          type: 'taxon', 
          group: 3,
          full_data: t,
          properties: [`Таксон: ${t.full_name}`]
        };
        nodes.push(node);
        nodeMap.set(t.guid, node);
      });

      pointsRes.data.forEach(p => {
        const node = {
          id: p.guid,
          name: p.location_original || p.display_date || 'Без названия',
          type: 'point',
          group: 2,
          latitude: p.latitude,
          longitude: p.longitude,
          full_data: p,
          properties: [
            `Место: ${p.location_original || '—'}`,
            `Дата: ${p.display_date || '—'}`,
            `Высота: ${p.elevation || '—'} м`
          ]
        };
        nodes.push(node);
        nodeMap.set(p.guid, node);

        if (p.collector_name) {
          const personNode = personsRes.data.find(person => person.full_name === p.collector_name);
          if (personNode && nodeMap.has(personNode.guid)) {
            const linkProps = [`Сбор: ${p.display_date || 'дата не указана'}`];
            links.push({
              source: personNode.guid,
              target: p.guid,
              type: 'collected_at',
              properties: linkProps
            });
            // Добавляем уникальные свойства для фильтрации
            setUniqueProperties(prev => [...new Set([...prev, ...linkProps])]);
          }
        }
      });

      for (const point of pointsRes.data) {
        try {
          const taxaLinksRes = await axios.get(`${API_URL}/point_taxa/${point.guid}`);
          taxaLinksRes.data.forEach(taxon => {
            if (nodeMap.has(taxon.guid)) {
              const linkProps = [`Содержит таксон: ${taxon.full_name}`];
              links.push({
                source: point.guid,
                target: taxon.guid,
                type: 'has_taxon',
                properties: linkProps
              });
              setUniqueProperties(prev => [...new Set([...prev, ...linkProps])]);
            }
          });
        } catch (error) {
          console.error('Ошибка загрузки таксонов для точки', point.guid);
        }
      }

      setGraphData({ nodes, links });
    } catch (error) {
      console.error('Ошибка загрузки данных для графа:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchTerm)}`);
      setSearchResults(response.data);
      
      // Подсветка и центрирование на первом найденном узле
      if (response.data.length > 0 && fgRef.current) {
        const firstResult = response.data[0];
        const node = graphData.nodes.find(n => n.id === firstResult.guid);
        if (node) {
          fgRef.current.centerAt(node.x, node.y, 1000);
          fgRef.current.zoom(2, 1000);
          fgRef.current.nodeColor(candidate =>
            candidate.id === firstResult.guid ? '#ff0000' : (candidate.group === 1 ? '#3498db' : candidate.group === 2 ? '#2ecc71' : '#9b59b6')
          );
          setTimeout(() => {
            if (fgRef.current) {
              fgRef.current.nodeColor(node =>
                node.group === 1 ? '#3498db' : node.group === 2 ? '#2ecc71' : '#9b59b6'
              );
            }
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  };

  const handleTableRowClick = (result) => {
    const node = graphData.nodes.find(n => n.id === result.guid);
    if (node && fgRef.current) {
      setSelectedNodeId(result.guid);
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(2, 1000);
      
      // Подсветка выбранного узла и всех связанных
      const connectedIds = graphData.links
        .filter(link => link.source.id === result.guid || link.target.id === result.guid)
        .flatMap(link => [link.source.id, link.target.id]);
      
      fgRef.current.nodeColor(candidate => {
        if (candidate.id === result.guid) return '#ff0000';
        if (connectedIds.includes(candidate.id)) return '#ffaa00';
        return candidate.group === 1 ? '#3498db' : candidate.group === 2 ? '#2ecc71' : '#9b59b6';
      });
      
      // Увеличиваем размер связанных узлов
      fgRef.current.nodeVal(candidate => {
        if (candidate.id === result.guid) return 8;
        if (connectedIds.includes(candidate.id)) return 6;
        return candidate.type === 'point' ? 3 : 5;
      });
      
      // Утолщаем связанные связи
      fgRef.current.linkWidth(link => {
        if (link.source.id === result.guid || link.target.id === result.guid) return 3;
        return 1;
      });
    }
  };

  const handleGraphNodeClick = (node) => {
    setSelectedNodeId(node.id);
    // Находим результат в поиске или создаём временный
    const tempResult = { guid: node.id, name: node.name, type: node.type };
    handleTableRowClick(tempResult);
  };

  const filterDataByProperty = () => {
    if (!filterProperty) return graphData;
    
    const filteredLinks = graphData.links.filter(link => 
      link.properties && link.properties.some(prop => prop.includes(filterProperty))
    );
    
    const filteredNodeIds = new Set();
    filteredLinks.forEach(link => {
      filteredNodeIds.add(link.source.id);
      filteredNodeIds.add(link.target.id);
    });
    
    const filteredNodes = graphData.nodes.filter(node => filteredNodeIds.has(node.id));
    
    return { nodes: filteredNodes, links: filteredLinks };
  };

  const displayData = filterProperty ? filterDataByProperty() : graphData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Верхняя панель: поиск + таблица результатов */}
      <div style={{ height: '35%', borderBottom: '1px solid #ddd', background: '#f9f9f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Поисковая строка */}
        <div style={{ padding: '10px', background: 'white', borderBottom: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Поиск по названиям, видам, фамилиям..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <button onClick={handleSearch} style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              🔍 Найти
            </button>
          </div>
          
          {/* Фильтр по свойствам связей */}
          {uniqueProperties.length > 0 && (
            <select 
              value={filterProperty} 
              onChange={(e) => setFilterProperty(e.target.value)}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', width: '100%' }}
            >
              <option value="">Все связи</option>
              {uniqueProperties.map(prop => (
                <option key={prop} value={prop}>{prop}</option>
              ))}
            </select>
          )}
        </div>

        {/* Таблица результатов Excel-подобная */}
        <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
          {searchResults.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f0f0f0' }}>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Тип</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Название</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Свойства</th>
                  <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Связи</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map(result => {
                  const node = graphData.nodes.find(n => n.id === result.guid);
                  const nodeLinks = graphData.links.filter(l => l.source.id === result.guid || l.target.id === result.guid);
                  return (
                    <tr 
                      key={result.guid} 
                      onClick={() => handleTableRowClick(result)}
                      style={{ 
                        cursor: 'pointer', 
                        backgroundColor: selectedNodeId === result.guid ? '#e3f2fd' : 'white',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      <td style={{ padding: '8px' }}>{result.type}</td>
                      <td style={{ padding: '8px' }}><strong>{result.name}</strong></td>
                      <td style={{ padding: '8px', fontSize: '11px' }}>
                        {node?.properties?.map((prop, i) => <div key={i}>{prop}</div>)}
                      </td>
                      <td style={{ padding: '8px', fontSize: '11px' }}>
                        {nodeLinks.map((link, i) => (
                          <div key={i}>{link.type === 'collected_at' ? '📦 Собрана' : '🔬 Содержит таксон'}</div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
              Введите поисковый запрос
            </div>
          )}
        </div>
      </div>

      {/* Нижняя панель: интерактивный граф */}
      <div style={{ height: '65%', position: 'relative', background: 'white' }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={displayData}
          nodeLabel="name"
          nodeColor={node => node.group === 1 ? '#3498db' : node.group === 2 ? '#2ecc71' : '#9b59b6'}
          nodeVal={node => node.type === 'point' ? 3 : 5}
          nodeRelSize={5}
          onNodeClick={handleGraphNodeClick}
          linkLabel={link => link.properties?.join(', ') || link.type}
          linkColor={() => '#999999'}
          linkWidth={1}
          cooldownTicks={100}
          onEngineStop={() => fgRef.current?.zoomToFit(400)}
        />
      </div>
    </div>
  );
};

export default GraphView;
