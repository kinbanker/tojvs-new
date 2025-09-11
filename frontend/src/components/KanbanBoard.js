import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import apiUtils from '../utils/api';

const KanbanBoard = ({ socket, lastMessage }) => {  // lastMessage prop 추가
  const [columns, setColumns] = useState({
    'buy-wait': { id: 'buy-wait', title: '매수대기', cards: [] },
    'buy-done': { id: 'buy-done', title: '매수완료', cards: [] },
    'sell-wait': { id: 'sell-wait', title: '매도대기', cards: [] },
    'sell-done': { id: 'sell-done', title: '매도완료', cards: [] }
  });

  useEffect(() => {
    loadCards();
  }, []);

  // n8n command-result 처리 추가
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'kanban' && lastMessage.data) {
      const { action, card } = lastMessage.data;
      
      if (action === 'ADD_CARD' && card) {
        console.log('Adding card from n8n:', card);
        
        // column을 column_id로 매핑
        const normalizedCard = {
          id: card.id || `card-${Date.now()}`,
          ticker: card.ticker,
          price: card.price,
          quantity: card.quantity,
          column_id: card.column || card.column_id,  // column 또는 column_id 처리
          notes: card.notes,
          created_at: card.createdAt || new Date().toISOString(),
          user_id: card.userId,
          username: card.username
        };
        
        addCard(normalizedCard.column_id, normalizedCard);
      }
    }
  }, [lastMessage]);

  useEffect(() => {
    if (!socket) return;

    const handleKanbanUpdate = (update) => {
      console.log('Kanban update received:', update);
      
      if (update.type === 'ADD') {
        addCard(update.columnId || update.column_id, update.card);
      } else if (update.type === 'MOVE') {
        moveCard(update.cardId, update.fromColumn, update.toColumn);
      }
    };

    socket.on('kanban-update', handleKanbanUpdate);

    return () => {
      socket.off('kanban-update', handleKanbanUpdate);
    };
  }, [socket]);

  const loadCards = async () => {
    try {
      const response = await apiUtils.getKanbanCards();
      
      const cardsByColumn = {
        'buy-wait': [],
        'buy-done': [],
        'sell-wait': [],
        'sell-done': []
      };
      
      // response.data가 배열인지 확인
      const cards = Array.isArray(response.data) ? response.data : response.data.cards || [];
      
      cards.forEach(card => {
        if (cardsByColumn[card.column_id]) {
          cardsByColumn[card.column_id].push(card);
        }
      });
      
      setColumns(prev => ({
        ...prev,
        'buy-wait': { ...prev['buy-wait'], cards: cardsByColumn['buy-wait'] },
        'buy-done': { ...prev['buy-done'], cards: cardsByColumn['buy-done'] },
        'sell-wait': { ...prev['sell-wait'], cards: cardsByColumn['sell-wait'] },
        'sell-done': { ...prev['sell-done'], cards: cardsByColumn['sell-done'] }
      }));
    } catch (error) {
      console.error('Failed to load cards:', error);
    }
  };

  const addCard = (columnId, card) => {
    console.log('Adding card to column:', columnId, card);
    
    setColumns(prev => {
      // columnId 유효성 검사
      if (!prev[columnId]) {
        console.error('Invalid column ID:', columnId);
        return prev;
      }
      
      // 중복 확인
      const isDuplicate = prev[columnId].cards.some(c => c.id === card.id);
      if (isDuplicate) {
        console.log('Card already exists:', card.id);
        return prev;
      }
      
      return {
        ...prev,
        [columnId]: {
          ...prev[columnId],
          cards: [...prev[columnId].cards, card]
        }
      };
    });
  };

  const moveCard = (cardId, fromColumn, toColumn) => {
    setColumns(prev => {
      const card = prev[fromColumn]?.cards.find(c => c.id === parseInt(cardId));
      if (!card) return prev;

      return {
        ...prev,
        [fromColumn]: {
          ...prev[fromColumn],
          cards: prev[fromColumn].cards.filter(c => c.id !== parseInt(cardId))
        },
        [toColumn]: {
          ...prev[toColumn],
          cards: [...prev[toColumn].cards, card]
        }
      };
    });
  };

  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    
    if (!destination) return;
    if (source.droppableId === destination.droppableId && 
        source.index === destination.index) return;
    
    moveCard(draggableId, source.droppableId, destination.droppableId);
    
    if (socket) {
      socket.emit('move-card', {
        cardId: draggableId,
        fromColumn: source.droppableId,
        toColumn: destination.droppableId
      });
    }
  };

  return (
    <div className="h-full">
      <h2 className="text-2xl font-bold mb-6">매매 현황</h2>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {Object.values(columns).map(column => (
            <div key={column.id} className="bg-gray-100 rounded-lg p-4">
              <h3 className="font-semibold mb-3 text-gray-700">
                {column.title} ({column.cards.length})
              </h3>
              
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-2 min-h-[200px] ${
                      snapshot.isDraggingOver ? 'bg-blue-50' : ''
                    }`}
                  >
                    {column.cards.map((card, index) => (
                      <Draggable
                        key={card.id}
                        draggableId={String(card.id)}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white p-3 rounded shadow-sm transition ${
                              snapshot.isDragging ? 'shadow-lg rotate-3' : ''
                            }`}
                          >
                            <div className="font-semibold text-blue-600">{card.ticker}</div>
                            <div className="text-sm text-gray-600">
                              ${card.price} × {card.quantity}주
                            </div>
                            {card.notes && (
                              <div className="text-xs text-gray-500 mt-1 italic">
                                {card.notes}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(card.created_at || card.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default KanbanBoard;
