import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import apiUtils from '../utils/api';

const KanbanBoard = ({ socket, lastMessage }) => {
  const [columns, setColumns] = useState({
    'buy-wait': { id: 'buy-wait', title: '매수대기', cards: [] },
    'buy-done': { id: 'buy-done', title: '매수완료', cards: [] },
    'sell-wait': { id: 'sell-wait', title: '매도대기', cards: [] },
    'sell-done': { id: 'sell-done', title: '매도완료', cards: [] }
  });
  
  // 중복 처리 방지를 위한 ref
  const processedCardIds = useRef(new Set());
  const lastProcessedMessageTime = useRef(null);

  useEffect(() => {
    loadCards();
  }, []);

  // n8n command-result 처리 (중복 방지 개선)
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'kanban' && lastMessage.data) {
      const { action, card } = lastMessage.data;
      
      // 타임스탬프 체크 (1초 이내 같은 메시지는 무시)
      const messageTime = lastMessage.timestamp;
      if (lastProcessedMessageTime.current === messageTime) {
        console.log('Duplicate message timestamp detected, skipping');
        return;
      }
      lastProcessedMessageTime.current = messageTime;
      
      if (action === 'ADD_CARD' && card) {
        // 카드 ID 체크
        const cardId = card.id || `card-${Date.now()}`;
        
        // 이미 처리한 카드인지 확인
        if (processedCardIds.current.has(cardId)) {
          console.log('Card already processed:', cardId);
          return;
        }
        
        console.log('Adding card from n8n:', card);
        processedCardIds.current.add(cardId);
        
        // column을 column_id로 매핑
        const normalizedCard = {
          id: cardId,
          ticker: card.ticker,
          price: card.price,
          quantity: card.quantity,
          column_id: card.column || card.column_id,
          notes: card.notes,
          created_at: card.createdAt || new Date().toISOString(),
          user_id: card.userId,
          username: card.username
        };
        
        addCard(normalizedCard.column_id, normalizedCard);
        
        // 오래된 ID 정리 (메모리 관리)
        if (processedCardIds.current.size > 100) {
          const idsArray = Array.from(processedCardIds.current);
          processedCardIds.current = new Set(idsArray.slice(-50));
        }
      }
    }
  }, [lastMessage]);

  // Socket의 kanban-update 이벤트는 다른 사용자의 업데이트나 카드 이동용으로만 사용
  useEffect(() => {
    if (!socket) return;

    const handleKanbanUpdate = (update) => {
      console.log('Kanban update received:', update);
      
      // MOVE 이벤트만 처리 (ADD는 lastMessage로 처리)
      if (update.type === 'MOVE') {
        moveCard(update.cardId, update.fromColumn, update.toColumn);
      }
      // ADD 이벤트는 무시 (lastMessage로 이미 처리됨)
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
          // 로드된 카드 ID를 처리된 목록에 추가
          processedCardIds.current.add(card.id);
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
      
      // 중복 확인 (state 레벨에서도 한 번 더 체크)
      const isDuplicate = prev[columnId].cards.some(c => c.id === card.id);
      if (isDuplicate) {
        console.log('Card already exists in state:', card.id);
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
