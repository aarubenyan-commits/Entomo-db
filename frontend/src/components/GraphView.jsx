import React, { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';
import { IconButton, Icons } from './IconLibrary';
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
  const [connectedNodes, setConnectedNodes] = useState([]);
  
  const fgRef = useRef();

  useEffect(() => {
    loadAllNodes();
  }, [refreshTrigger]);

  useEffect(() => {
    if (selectedNode) {
      loadGraphForNode(selectedNode);
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
      
      // Сборщики (люди)
      personsRes.data.forEach(p => {
        nodes.push({ 
          id: p.guid, 
          name: p.display_name, 
          type: 'person', 
          group: 1,
          showLabel: true // всегда показываем текст
        });
      });

      // Виды
      taxaRes.data.forEach(t => {
        nodes.push({ 
          id: t.guid, 
          name: t.display_name || `${t.genus} ${t.species || ''}`, 
          type: 'species', 
          group: 3,
          showLabel: true, // всегда показываем текст
          genus: t.genus, 
          species: t.species, 
          subspecies: t.subspecies
        });
      });

      // Точки
      pointsRes.data.forEach(p => {
        nodes.push({
          id: p.guid, 
          name: p.location_original || p.display_date || 'Без названия',
          type: 'point', 
          group: 2,
          showLabel: false, // текст только при наведении/выделении
          location: p.location_original, 
          date: p.display_date, 
          collector: p.collector_name,
          latitude: p.latitude, 
          longitude: p.longitude
        });
      });

      // Исследования
      studiesRes.data.forEach(s => {
        nodes.push({
          id: s.guid, 
          name: s.title || s.url || 'Исследование',
          type: 'study', 
          group: 4,
          showLabel: false, // текст только при наведении/выделении
          title: s.title, 
          url: s.url, 
          description: s.description, 
          authors: s.authors
        });
      });

      setAllNodes(nodes);
      console.log('Загружено узлов:', nodes.length, 'из них исследований:', studiesRes.data.length);
    } catch (error) {
      console.error('Ошибка загрузки узлов:', error);
    } finally {
      setLoading(false);
    }
  };

  const getNodeType = (nodeId) => {
    const node = allNodes.find(n => n.id === nodeId);
    return node?.type || 'point';
  };

  const loadGraphForNode = async (node) => {
    setLoading(true);
    try {
      const nodesSet = new Set();
      const linksSet = new Set();
      const nodesList = [];
      const linksList = [];
      
      nodesSet.add(node.id);
      nodesList.push(node);
      
      const loadConnections = async (currentNodeId, currentDepth, visited = new Set()) => {
        if (currentDepth > depth || visited.has(currentNodeId)) return;
        visited.add(currentNodeId);
        
        try {
          const response = await axios.get(`${API_URL}/objects/${getNodeType(currentNodeId)}/${currentNodeId}/links`);
          
          for (const link of response.data) {
            let targetId = null;
            
            if (link.direction === 'outgoing') {
              targetId = link.target_guid;
            } else {
              targetId = link.target_guid;
            }
            
            if (targetId && !nodesSet.has(targetId)) {
              const targetNode = allNodes.find(n => n.id === targetId);
              if (targetNode) {
                nodesSet.add(targetId);
                nodesList.push(targetNode);
                await loadConnections(targetId, currentDepth + 1, visited);
              }
            }
            
            const linkKey = `${currentNodeId}-${targetId}`;
            if (!linksSet.has(linkKey) && targetId) {
              linksSet.add(linkKey);
              linksList.push({
                source: currentNodeId,
                target: targetId,
                relation_type: link.relation_type,
                link_guid: link.link_guid
              });
            }
          }
        } catch (error) {
          console.error('Ошибка загрузки связей:', error);
        }
      };
      
      await loadConnections(node.id, 1);
      
      setGraphData({ nodes: nodesList, links: linksList });
      
      const connected = linksList.map(l => ({
        source: l.source,
        target: l.target,
        type: l.relation_type
      }));
      setConnectedNodes(connected);
      
    } catch (error) {
      console.error('Ошибка загрузки графа:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setShowNodeDetails(true);
    setNodeDetails(node);
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

  // Размер узлов: точки меньше на 70%
  const getNodeSize = (node) => {
    switch (node.type) {
      case 'point': return 2;   // было 10, уменьшили на 70%
      case 'person': return 2;
      case 'species': return 2;
      case 'study': return 2;
      default: return 2;
    }
  };

  // Отображение текста на узлах
  const getNodeLabel = (node) => {
    const icon = node.type === 'person' ? '👤 ' : node.type === 'species' ? '🔬 ' : '';
    
    // Для людей и видов всегда показываем текст
    if (node.type === 'person' || node.type === 'species') {
      let label = node.name;
      if (label && label.length > 20) {
        label = label.substring(0, 17) + '...';
      }
      return icon + label;
    }
    
    // Для точек и исследований - текст при наведении (через tooltip)
    return '';
  };

  // Всплывающая подсказка при наведении
  const getNodeTooltip = (node) => {
    switch (node.type) {
      case 'point':
        return `📍 ${node.name}\n📅 ${node.date || 'дата не указана'}\n👤 ${node.collector || 'сборщик не указан'}`;
      case 'study':
        return `📚 ${node.name}\n✍️ ${node.authors || 'авторы не указаны'}`;
      case 'person':
        return `👤 ${node.name}`;
      case 'species':
        return `🔬 ${node.name}`;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      {/* Верхняя панель */}
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
            <option value={1}>1 уровень (только прямые связи)</option>
            <option value={2}>2 уровня (связи связей)</option>
            <option value={3}>3 уровня (максимум)</option>
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
          </div>
        )}
        
        {loading && <div style={{ fontSize: '12px', color: '#666' }}>⏳ Загрузка...</div>}
      </div>

      {/* Граф */}
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
            cooldownTicks={50}
            onEngineStop={() => fgRef.current?.zoomToFit(400)}
            backgroundColor="#f5f5f5"
            // Кастомный рендер текста на узлах
            nodeCanvasObject={(node, ctx, globalScale) => {
              const size = getNodeSize(node);
              ctx.fillStyle = getNodeColor(node);
              ctx.beginPath();
              ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
              ctx.fill();
              
              // Рисуем текст только для людей и видов
              if (node.type === 'person' || node.type === 'species') {
                ctx.fillStyle = '#333';
                ctx.font = `${Math.min(12, 12 / globalScale)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                let label = node.name;
                if (label && label.length > 20) {
                  label = label.substring(0, 17) + '...';
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
          </div>
        )}
      </div>

      {/* Модальное окно с деталями узла - без изменений */}
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
                {nodeDetails.collector && (
                  <div style={{ marginBottom: '10px' }}>
                    <strong>👤 Сборщик:</strong>
                    <div>{nodeDetails.collector}</div>
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
            
            {connectedNodes.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <strong>🔗 Связи ({connectedNodes.length}):</strong>
                <div style={{ maxHeight: '150px', overflow: 'auto', marginTop: '8px' }}>
                  {connectedNodes.slice(0, 10).map((conn, idx) => {
                    const targetNode = allNodes.find(n => n.id === conn.target);
                    return targetNode ? (
                      <div key={idx} style={{ 
                        padding: '6px', 
                        borderBottom: '1px solid #eee',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>
                          {conn.type === 'collected_at' && '📌 собрал '}
                          {conn.type === 'has_taxon' && '🔬 содержит '}
                          {conn.type === 'source' && '📚 источник '}
                          <strong>{getTypeIcon(targetNode.type)} {targetNode.name?.substring(0, 40)}</strong>
                        </span>
                      </div>
                    ) : null;
                  })}
                  {connectedNodes.length > 10 && (
                    <div style={{ fontSize: '11px', color: '#999', padding: '5px', textAlign: 'center' }}>
                      и еще {connectedNodes.length - 10} связей...
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <IconButton icon="Edit" label="Редактировать" onClick={openEditDialog} style={{ background: '#3498db', color: 'white' }} />
              <IconButton icon="Close" label="Закрыть" onClick={() => setShowNodeDetails(false)} style={{ background: '#95a5a6', color: 'white' }} />
            </div>
          </div>
        </div>
      )}

      {/* Форма редактирования */}
      {showEditDialog && editType && editGuid && (
        <>
          {editType === 'point' && (
            <PointForm
              point={allNodes.find(n => n.id === editGuid)}
              onClose={() => handleEditComplete(false)}
              onSave={handleEditComplete}
            />
          )}
          {editType === 'person' && (
            <CollectorManager
              onClose={() => handleEditComplete(false)}
              onUpdate={() => handleEditComplete(true)}
            />
          )}
          {editType === 'species' && (
            <TaxonManager
              onClose={() => handleEditComplete(false)}
              onUpdate={() => handleEditComplete(true)}
            />
          )}
          {editType === 'study' && (
            <StudyManager
              onClose={() => handleEditComplete(false)}
              onUpdate={() => handleEditComplete(true)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default GraphView;

// Дополнение для GraphView - поддержка species и subspecies
// В функции loadConnections нужно добавить обработку типов "species" и "subspecies"
