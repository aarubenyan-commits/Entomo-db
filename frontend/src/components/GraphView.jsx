import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ForceGraph2D from 'react-force-graph-2d';

const API_URL = 'http://127.0.0.1:8000';

const GraphView = ({ onUpdate }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const fgRef = useRef();

  // Загрузка всех данных для графа (условно – все точки, сборщики, таксоны и их связи)
  // Для производительности можно подгружать только по запросу, но пока сделаем загрузку всех точек и связанных объектов.
  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = async () => {
    setLoading(true);
    try {
      // 1. Загружаем все точки
      const pointsRes = await axios.get(`${API_URL}/points`);
      const points = pointsRes.data;
      
      // 2. Загружаем всех сборщиков
      const personsRes = await axios.get(`${API_URL}/persons`);
      const persons = personsRes.data;
      
      // 3. Загружаем все таксоны (если нужны)
      const taxaRes = await axios.get(`${API_URL}/taxa`);
      const taxa = taxaRes.data;
      
      // Создаём узлы
      const nodes = [];
      const nodeMap = {};
      
      // Сборщики
      persons.forEach(p => {
        const nodeId = `person_${p.guid}`;
        nodeMap[nodeId] = { id: nodeId, type: 'person', guid: p.guid, name: p.full_name };
        nodes.push(nodeMap[nodeId]);
      });
      
      // Точки
      points.forEach(p => {
        const nodeId = `point_${p.guid}`;
        nodeMap[nodeId] = { id: nodeId, type: 'point', guid: p.guid, name: p.location_original?.substring(0, 30) || '—' };
        nodes.push(nodeMap[nodeId]);
      });
      
      // Таксоны
      taxa.forEach(t => {
        const nodeId = `taxon_${t.guid}`;
        nodeMap[nodeId] = { id: nodeId, type: 'taxon', guid: t.guid, name: `${t.genus} ${t.species || ''}`.trim() };
        nodes.push(nodeMap[nodeId]);
      });
      
      // Загружаем связи для каждого узла (можно оптимизировать, но для начала так)
      const links = [];
      const addedLinks = new Set();
      
      for (const node of nodes) {
        const linksRes = await axios.get(`${API_URL}/objects/${node.type}/${node.guid}/links`);
        for (const link of linksRes.data) {
          let targetNodeId = null;
          if (link.target_type === 'person') targetNodeId = `person_${link.target_guid}`;
          else if (link.target_type === 'point') targetNodeId = `point_${link.target_guid}`;
          else if (link.target_type === 'taxon') targetNodeId = `taxon_${link.target_guid}`;
          if (targetNodeId && nodeMap[targetNodeId]) {
            const key = `${node.id}-${targetNodeId}-${link.relation_type}`;
            if (!addedLinks.has(key)) {
              addedLinks.add(key);
              links.push({
                source: node.id,
                target: targetNodeId,
                relation_type: link.relation_type,
                link_guid: link.link_guid
              });
            }
          }
        }
      }
      
      setGraphData({ nodes, links });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setShowDetails(true);
  };

  const handleDeleteLink = async (linkGuid) => {
    if (window.confirm('Удалить связь?')) {
      await axios.delete(`${API_URL}/links/${linkGuid}`);
      setShowDetails(false);
      loadGraphData();
      if (onUpdate) onUpdate();
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const res = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchQuery)}&type=`);
    setSearchResults(res.data);
    // Центрировать граф на найденном узле (первом)
    if (res.data.length) {
      const found = res.data[0];
      const nodeId = `${found.type}_${found.guid}`;
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node && fgRef.current) {
        fgRef.current.centerAt(node.x, node.y, 1000);
        fgRef.current.zoom(2, 1000);
      }
    }
  };

  const getNodeColor = (node) => {
    if (node.type === 'person') return '#f39c12';
    if (node.type === 'point') return '#2ecc71';
    if (node.type === 'taxon') return '#3498db';
    return '#95a5a6';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Поиск узла по имени..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: 1, padding: '8px' }}
        />
        <button onClick={handleSearch}>Найти</button>
      </div>
      <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>Загрузка графа...</div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel="name"
            nodeColor={getNodeColor}
            nodeCanvasObject={(node, ctx) => {
              ctx.fillStyle = getNodeColor(node);
              ctx.beginPath();
              ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
              ctx.fill();
              ctx.fillStyle = '#000';
              ctx.font = `${8}px Arial`;
              ctx.fillText(node.name, node.x + 8, node.y + 4);
            }}
            onNodeClick={handleNodeClick}
            linkLabel={link => link.relation_type}
            linkColor={() => '#aaa'}
            linkWidth={2}
            cooldownTicks={50}
          />
        )}
      </div>
      {showDetails && selectedNode && (
        <div style={{
          position: 'absolute', bottom: 20, right: 20, backgroundColor: 'white', border: '1px solid #ccc',
          borderRadius: '8px', padding: '15px', width: '300px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 100
        }}>
          <h4>{selectedNode.name}</h4>
          <p><strong>Тип:</strong> {selectedNode.type}</p>
          <p><strong>GUID:</strong> {selectedNode.guid}</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button onClick={() => window.alert('Редактирование будет добавлено позже')}>Редактировать</button>
            <button onClick={() => setShowDetails(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphView;
