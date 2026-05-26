import React, { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';
import { IconButton } from './IconLibrary';
import PointForm from './PointForm';
import CollectorManager from './CollectorManager';
import TaxonManager from './TaxonManager';
import StudyManager from './StudyManager';

const API_URL = 'http://127.0.0.1:8000';

const GraphView = ({ onUpdate, refreshTrigger }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [allNodes, setAllNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [depth, setDepth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showNodeDetails, setShowNodeDetails] = useState(false);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editType, setEditType] = useState(null);
  const [editGuid, setEditGuid] = useState(null);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  
  const fgRef = useRef();
  const abortControllerRef = useRef(null);
  const doubleClickTimeoutRef = useRef(null); // Для предотвращения конфликта с обычным кликом

  useEffect(() => {
    loadAllNodes();
  }, [refreshTrigger]);

  useEffect(() => {
    if (selectedNode) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      loadGraphForNode(selectedNode, abortControllerRef.current.signal);
      setCurrentNodeId(selectedNode.id);
    }
  }, [selectedNode, depth]);

  const loadAllNodes = async () => {
    setLoading(true);
    try {
      const [pointsRes, personsRes, taxaRes, studiesRes] = await Promise.all([
        axios.get(`${API_URL}/points`),
        axios.get(`${API_URL}/persons`),
        axios.get(`${API_URL}/taxa`),
        axios.get(`${API_URL}/studies`)
      ]);

      const nodes = [];
      
      personsRes.data.forEach(p => {
        nodes.push({ 
          id: p.guid, 
          name: p.display_name, 
          type: 'person', 
          group: 1,
          showLabel: true
        });
      });

      taxaRes.data.forEach(t => {
        nodes.push({ 
          id: t.guid, 
          name: t.display_name || `${t.genus} ${t.species || ''}`, 
          type: 'species', 
          group: 3,
          showLabel: true,
          genus: t.genus, 
          species: t.species, 
          subspecies: t.subspecies
        });
      });

      pointsRes.data.forEach(p => {
        nodes.push({
          id: p.guid, 
          name: p.location_original || p.display_date || 'Без названия',
          type: 'point', 
          group: 2,
          showLabel: false,
          location: p.location_original, 
          date: p.display_date, 
          collector: p.collector_name,
          latitude: p.latitude, 
          longitude: p.longitude,
          collectors: p.collectors
        });
      });

      studiesRes.data.forEach(s => {
        nodes.push({
          id: s.guid, 
          name: s.title || s.url || 'Исследование',
          type: 'study', 
          group: 4,
          showLabel: false,
          title: s.title, 
          url: s.url, 
          description: s.description, 
          authors: s.authors
        });
      });

      setAllNodes(nodes);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Ошибка загрузки узлов:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const getNodeType = (nodeId) => {
    const node = allNodes.find(n => n.id === nodeId);
    return node?.type || 'point';
  };

  const loadGraphForNode = async (node, signal) => {
    setLoading(true);
    
    try {
      const nodesSet = new Set();
      const linksSet = new Set();
      const nodesList = [];
      const linksList = [];
      
      nodesSet.add(node.id);
      nodesList.push(node);
      
      const queue = [{ nodeId: node.id, currentDepth: 0 }];
      const visited = new Set();
      visited.add(node.id);
      
      while (queue.length > 0) {
        const { nodeId, currentDepth } = queue.shift();
        
        if (currentDepth >= depth) continue;
        
        try {
          const nodeType = getNodeType(nodeId);
          const response = await axios.get(`${API_URL}/objects/${nodeType}/${nodeId}/links`, { signal });
          
          for (const link of response.data) {
            let targetId = link.target_guid;
            
            const linkKey = `${nodeId}-${targetId}`;
            if (!linksSet.has(linkKey) && targetId) {
              linksSet.add(linkKey);
              linksList.push({
                source: nodeId,
                target: targetId,
                relation_type: link.relation_type,
                link_guid: link.link_guid
              });
            }
            
            if (!nodesSet.has(targetId)) {
              const targetNode = allNodes.find(n => n.id === targetId);
              if (targetNode) {
                nodesSet.add(targetId);
                nodesList.push(targetNode);
                
                if (!visited.has(targetId)) {
                  visited.add(targetId);
                  queue.push({ nodeId: targetId, currentDepth: currentDepth + 1 });
                }
              }
            }
          }
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.error('Ошибка загрузки связей:', error);
          }
        }
      }
      
      setGraphData({ nodes: nodesList, links: linksList });
      
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(400);
        }
      }, 100);
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Ошибка загрузки графа:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  // ========== НОВЫЙ ОБРАБОТЧИК ДВОЙНОГО КЛИКА ==========
  const handleNodeDoubleClick = (node) => {
    // Очищаем таймаут, если был (предотвращаем открытие деталей после двойного клика)
    if (doubleClickTimeoutRef.current) {
      clearTimeout(doubleClickTimeoutRef.current);
      doubleClickTimeoutRef.current = null;
    }
    
    // Открываем форму редактирования в зависимости от типа узла
    setEditType(node.type);
    setEditGuid(node.id);
    setShowEditDialog(true);
    setShowNodeDetails(false);
  };

  // ========== ИЗМЕНЕННЫЙ ОБРАБОТЧИК ОДИНАРНОГО КЛИКА ==========
  const handleNodeClick = (node) => {
    // Задержка перед открытием деталей, чтобы проверить не было ли двойного клика
    if (doubleClickTimeoutRef.current) {
      clearTimeout(doubleClickTimeoutRef.current);
      doubleClickTimeoutRef.current = null;
    }
    
    doubleClickTimeoutRef.current = setTimeout(() => {
      // Это одинарный клик - показываем детали
      setSelectedNode(node);
      setShowNodeDetails(true);
      setNodeDetails(node);
      doubleClickTimeoutRef.current = null;
    }, 200);
  };

  const handleSearch = async () => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/search?q=${encodeURIComponent(searchTerm)}`);
      const results = response.data.map(r => {
        const fullNode = allNodes.find(n => n.id === r.guid);
        return { ...r, ...fullNode };
      });
      setSearchResults(results);
    } catch (error) {
      console.error('Ошибка поиска:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectSearchResult = (result) => {
    const node = allNodes.find(n => n.id === result.guid);
    if (node) {
      setSelectedNode(node);
      setSearchTerm('');
      setSearchResults([]);
    }
  };

  const openEditDialog = () => {
    if (!selectedNode) return;
    setEditType(selectedNode.type);
    setEditGuid(selectedNode.id);
    setShowEditDialog(true);
    setShowNodeDetails(false);
  };

  const handleEditComplete = (success) => {
    if (success) {
      loadAllNodes();
      if (selectedNode) {
        loadGraphForNode(selectedNode);
      }
      if (onUpdate) onUpdate();
    }
    setShowEditDialog(false);
    setEditType(null);
    setEditGuid(null);
  };

  const getNodeColor = (node) => {
    switch (node.type) {
      case 'person': return '#3498db';
      case 'point': return '#2ecc71';
      case 'species': return '#9b59b6';
      case 'study': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  const getNodeSize = (node) => {
    return 2; // Увеличил размер для лучшей кликабельности
  };

  const getNodeTooltip = (node) => {
    switch (node.type) {
      case 'point':
        const collectorNames = node.collectors?.map(c => c.display_name).join(', ') || node.collector || 'сборщик не указан';
        return `📍 ${node.name}\n📅 ${node.date || 'дата не указана'}\n👤 ${collectorNames}\n\n💡 Двойной клик - редактировать`;
      case 'study':
        return `📚 ${node.name}\n✍️ ${node.authors || 'авторы не указаны'}\n\n💡 Двойной клик - редактировать`;
      case 'person':
        return `👤 ${node.name}\n\n💡 Двойной клик - редактировать`;
      case 'species':
        return `🔬 ${node.name}\n\n💡 Двойной клик - редактировать`;
      default:
        return node.name;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'person': return '👤';
      case 'point': return '📍';
      case 'species': return '🔬';
      case 'study': return '📚';
      default: return '📄';
    }
  };

  const getTypeName = (type) => {
    switch (type) {
      case 'person': return 'Сборщик';
      case 'point': return 'Точка сбора';
      case 'species': return 'Вид';
      case 'study': return 'Исследование';
      default: return 'Объект';
    }
  };

  // Рендер компонента для редактирования в зависимости от типа
  const renderEditDialog = () => {
    if (!showEditDialog || !editType || !editGuid) return null;
    
    const nodeData = allNodes.find(n => n.id === editGuid);
    
    switch (editType) {
      case 'point':
        return (
          <PointForm
            point={nodeData}
            onClose={() => handleEditComplete(false)}
            onSave={(success) => handleEditComplete(success)}
          />
        );
      case 'person':
        return (
          <CollectorManager
            onClose={() => handleEditComplete(false)}
            onUpdate={() => handleEditComplete(true)}
          />
        );
      case 'species':
        return (
          <TaxonManager
            onClose={() => handleEditComplete(false)}
            onUpdate={() => handleEditComplete(true)}
          />
        );
      case 'study':
        return (
          <StudyManager
            onClose={() => handleEditComplete(false)}
            onUpdate={() => handleEditComplete(true)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      <div style={{ 
        padding: '12px', 
        background: 'white', 
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '15px',
        alignItems: 'center',
        flexWrap: 'wrap',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 2, minWidth: '200px' }}>
          <input
            type="text"
            placeholder="🔍 Поиск (минимум 2 символа)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, padding: '8px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
          <IconButton icon="Search" onClick={handleSearch} style={{ background: '#3498db', color: 'white', padding: '8px 16px' }} />
        </div>
        
        {searchResults.length > 0 && (
          <div style={{ 
            position: 'absolute', 
            top: '60px', 
            left: '20px', 
            background: 'white', 
            border: '1px solid #ddd', 
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            maxWidth: '400px',
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            {searchResults.map(result => (
              <div 
                key={result.guid}
                onClick={() => selectSearchResult(result)}
                style={{ 
                  padding: '10px 15px', 
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <div><strong>{getTypeIcon(result.type)} {result.name}</strong></div>
                <div style={{ fontSize: '11px', color: '#666' }}>{getTypeName(result.type)}</div>
              </div>
            ))}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>📊 Глубина связей:</span>
          <select 
            value={depth} 
            onChange={(e) => setDepth(parseInt(e.target.value))}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
          >
            <option value={1}>1 уровень</option>
            <option value={2}>2 уровня</option>
            <option value={3}>3 уровня</option>
          </select>
        </div>
        
        {selectedNode && (
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            alignItems: 'center',
            padding: '6px 12px',
            background: '#e8f4f8',
            borderRadius: '20px'
          }}>
            <span style={{ fontSize: '13px' }}>
              <strong>Выбрано:</strong> {getTypeIcon(selectedNode.type)} {selectedNode.name?.substring(0, 30)}
            </span>
            <IconButton icon="Info" onClick={() => setShowNodeDetails(true)} title="Подробнее" />
            <IconButton icon="Edit" onClick={openEditDialog} title="Редактировать" style={{ background: '#27ae60', color: 'white' }} />
          </div>
        )}
        
        {loading && <div style={{ fontSize: '12px', color: '#666' }}>⏳ Загрузка...</div>}
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#f5f5f5' }}>
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel={getNodeTooltip}
            nodeColor={getNodeColor}
            nodeVal={getNodeSize}
            linkLabel={link => {
              switch (link.relation_type) {
                case 'collected_at': return '📌 собрал';
                case 'has_taxon': return '🔬 содержит таксон';
                case 'source': return '📚 источник';
                default: return link.relation_type;
              }
            }}
            linkColor={() => '#aaa'}
            linkWidth={2}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}  // ← НОВЫЙ ПРОП!
            cooldownTicks={50}
            onEngineStop={() => fgRef.current?.zoomToFit(400)}
            backgroundColor="#f5f5f5"
            nodeCanvasObject={(node, ctx, globalScale) => {
              const size = getNodeSize(node);
              ctx.fillStyle = getNodeColor(node);
              ctx.beginPath();
              ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
              ctx.fill();
              
              // Добавляем индикатор редактирования для всех узлов
              ctx.fillStyle = '#fff';
              ctx.font = `${Math.min(10, 10 / globalScale)}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('✎', node.x + size * 0.7, node.y - size * 0.7);
              
              if (node.type === 'person' || node.type === 'species') {
                ctx.fillStyle = '#333';
                ctx.font = `${Math.min(11, 11 / globalScale)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                let label = node.name;
                if (label && label.length > 15) {
                  label = label.substring(0, 12) + '...';
                }
                ctx.fillText(label, node.x, node.y + size + 4);
              }
            }}
          />
        ) : (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%',
            color: '#999',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <span style={{ fontSize: '48px' }}>🗺️</span>
            <p>Выберите элемент из поиска или кликните на узел для отображения связей</p>
            <p style={{ fontSize: '12px' }}>💡 Двойной клик на узле - редактирование</p>
          </div>
        )}
      </div>

      {showNodeDetails && nodeDetails && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            width: '500px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>
                {getTypeIcon(nodeDetails.type)} {getTypeName(nodeDetails.type)}
              </h3>
              <IconButton icon="Close" onClick={() => setShowNodeDetails(false)} style={{ padding: '4px', fontSize: '20px' }} />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <strong>Название:</strong>
              <div style={{ padding: '8px', background: '#f5f5f5', borderRadius: '6px', marginTop: '5px' }}>
                {nodeDetails.name}
              </div>
            </div>
            
            {nodeDetails.type === 'point' && (
              <>
                {nodeDetails.location && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>📍 Место:</strong>
                    <div>{nodeDetails.location}</div>
                  </div>
                )}
                {nodeDetails.date && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>📅 Дата:</strong>
                    <div>{nodeDetails.date}</div>
                  </div>
                )}
                {(nodeDetails.collectors?.length > 0 || nodeDetails.collector) && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>👤 Сборщик(и):</strong>
                    <div>{nodeDetails.collectors?.map(c => c.display_name).join(', ') || nodeDetails.collector}</div>
                  </div>
                )}
              </>
            )}
            
            {nodeDetails.type === 'species' && (
              <>
                {nodeDetails.genus && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Род:</strong>
                    <div><em>{nodeDetails.genus}</em></div>
                  </div>
                )}
                {nodeDetails.species && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Вид:</strong>
                    <div><em>{nodeDetails.species}</em></div>
                  </div>
                )}
              </>
            )}
            
            {nodeDetails.type === 'study' && (
              <>
                {nodeDetails.authors && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Автор(ы):</strong>
                    <div>{nodeDetails.authors}</div>
                  </div>
                )}
                {nodeDetails.url && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>🔗 Ссылка:</strong>
                    <div><a href={nodeDetails.url} target="_blank" rel="noopener noreferrer">{nodeDetails.url}</a></div>
                  </div>
                )}
                {nodeDetails.description && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Описание:</strong>
                    <div style={{ fontSize: '13px', color: '#666' }}>{nodeDetails.description}</div>
                  </div>
                )}
              </>
            )}
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <IconButton icon="Edit" label="Редактировать" onClick={openEditDialog} style={{ background: '#27ae60', color: 'white' }} />
              <IconButton icon="Close" label="Закрыть" onClick={() => setShowNodeDetails(false)} style={{ background: '#95a5a6', color: 'white' }} />
            </div>
            
            <div style={{ marginTop: '15px', padding: '8px', background: '#e8f4f8', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}>
              💡 Совет: Двойной клик на узле графа открывает редактор
            </div>
          </div>
        </div>
      )}

      {renderEditDialog()}
    </div>
  );
};

export default GraphView;