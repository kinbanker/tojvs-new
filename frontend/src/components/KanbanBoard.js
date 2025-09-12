import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Edit2, Trash2, X, Check, ArrowRight } from 'lucide-react';
import apiUtils from '../utils/api';
import toast from 'react-hot-toast';

const KanbanBoard = ({ socket, lastMessage }) => {
  const [columns, setColumns] = useState({
    'buy-wait': { id: 'buy-wait', title: '매수대기', cards: [] },
    'buy-done': { id: 'buy-done', title: '매수완료', cards: [] },
    'sell-wait': { id: 'sell-wait', title: '매도대기', cards: [] },
    'sell-done': { id: 'sell-done', title: '매도완료', cards: [] }
  });
  
  const [editingCard, setEditingCard] = useState(null);
  const [editForm, setEditForm] = useState({
    ticker: '',
    price: '',
    quantity: '',
    notes: ''
  });
  
  // 중복 처리 방지를 위한 ref
  const processedCardIds = useRef(new Set());
  const lastProcessedMessageTime = useRef(null);

  // 칼럼 진행 순서 정의
  const columnProgression = {
    'buy-wait': 'buy-done',
    'buy-done': 'sell-wait',
    'sell-wait': 'sell-done',
    'sell-done': null // 마지막 단계
  };

  // 칼럼별 이전 단계 정의 (역방향)
  const columnPrevious = {
    'buy-done': 'buy-wait',
    'sell-wait': 'buy-done',
    'sell-done': 'sell-wait',
    'buy-wait': null // 첫 단계
  };

  useEffect(() => {
    loadCards();
  }, []);

  // 카드 찾기 함수
  const findSimilarCard = (ticker, targetColumn) => {
    const searchColumns = [];
    
    // 목표 칼럼의 이전 단계 칼럼을 우선 검색
    const previousColumn = columnPrevious[targetColumn];
    if (previousColumn) {
      searchColumns.push(previousColumn);
    }
    
    // 그 외 모든 칼럼도 검색 (현재 칼럼 제외)
    Object.keys(columns).forEach(col => {
      if (col !== targetColumn && !searchColumns.includes(col)) {
        searchColumns.push(col);
      }
    });

    let foundCards = [];
    
    // 각 칼럼에서 티커가 일치하는 카드 찾기
    searchColumns.forEach(colId => {
      const matchingCards = columns[colId].cards.filter(card => 
        card.ticker.toUpperCase() === ticker.toUpperCase()
      );
      
      matchingCards.forEach(card => {
        foundCards.push({
          card,
          columnId: colId,
          // 이전 단계 카드에 높은 우선순위 부여
          priority: colId === previousColumn ? 2 : 1
        });
      });
    });

    // 우선순위와 생성 시간으로 정렬 (우선순위 높은 것, 최신 것 순)
    foundCards.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 같은 우선순위면 최신 카드 우선
      return new Date(b.card.created_at || b.card.createdAt) - 
             new Date(a.card.created_at || a.card.createdAt);
    });

    return foundCards.length > 0 ? foundCards[0] : null;
  };

  // 카드 이동 함수 개선
  const moveCardToColumn = async (cardId, fromColumn, toColumn) => {
    try {
      // 로컬 상태 업데이트
      setColumns(prev => {
        const card = prev[fromColumn]?.cards.find(c => c.id === cardId);
        if (!card) return prev;

        return {
          ...prev,
          [fromColumn]: {
            ...prev[fromColumn],
            cards: prev[fromColumn].cards.filter(c => c.id !== cardId)
          },
          [toColumn]: {
            ...prev[toColumn],
            cards: [...prev[toColumn].cards, { ...card, column_id: toColumn }]
          }
        };
      });

      // 서버에 업데이트
      await apiUtils.updateKanbanCard(cardId, {
        column_id: toColumn
      });

      // Socket으로 다른 클라이언트에 알림
      if (socket) {
        socket.emit('move-card', {
          cardId,
          fromColumn,
          toColumn
        });
      }

      return true;
    } catch (error) {
      console.error('Failed to move card:', error);
      // 실패 시 원래 위치로 롤백
      setColumns(prev => {
        const card = prev[toColumn]?.cards.find(c => c.id === cardId);
        if (!card) return prev;

        return {
          ...prev,
          [toColumn]: {
            ...prev[toColumn],
            cards: prev[toColumn].cards.filter(c => c.id !== cardId)
          },
          [fromColumn]: {
            ...prev[fromColumn],
            cards: [...prev[fromColumn].cards, card]
          }
        };
      });
      return false;
    }
  };

  // n8n command-result 처리 개선
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'kanban' && lastMessage.data) {
      const { action, card } = lastMessage.data;
      
      // 타임스탬프 체크
      const messageTime = lastMessage.timestamp;
      if (lastProcessedMessageTime.current === messageTime) {
        console.log('Duplicate message timestamp detected, skipping');
        return;
      }
      lastProcessedMessageTime.current = messageTime;
      
      if (action === 'ADD_CARD' && card) {
        const cardId = card.id || `card-${Date.now()}`;
        const targetColumn = card.column || card.column_id;
        const ticker = card.ticker;
        
        console.log('Processing kanban command:', { ticker, targetColumn, action });
        
        // 1. 먼저 유사한 카드를 찾기
        const similarCard = findSimilarCard(ticker, targetColumn);
        
        if (similarCard) {
          // 2. 유사한 카드가 있으면 이동
          console.log(`Moving existing card: ${ticker} from ${similarCard.columnId} to ${targetColumn}`);
          
          moveCardToColumn(
            similarCard.card.id, 
            similarCard.columnId, 
            targetColumn
          ).then(success => {
            if (success) {
              toast.success(
                <div>
                  <strong>{ticker}</strong> 카드를 이동했습니다
                  <div className="text-xs mt-1 flex items-center">
                    {columns[similarCard.columnId].title} 
                    <ArrowRight className="w-3 h-3 mx-1" />
                    {columns[targetColumn].title}
                  </div>
                </div>,
                { duration: 3000 }
              );
            }
          });
          
        } else {
          // 3. 유사한 카드가 없으면 새로 생성
          if (processedCardIds.current.has(cardId)) {
            console.log('Card already processed:', cardId);
            return;
          }
          
          console.log('Creating new card:', card);
          processedCardIds.current.add(cardId);
          
          const normalizedCard = {
            id: cardId,
            ticker: card.ticker,
            price: card.price,
            quantity: card.quantity,
            column_id: targetColumn,
            notes: card.notes,
            created_at: card.createdAt || new Date().toISOString(),
            user_id: card.userId,
            username: card.username
          };
          
          addCard(targetColumn, normalizedCard);
          toast.success(
            <div>
              <strong>{ticker}</strong> 카드를 생성했습니다
              <div className="text-xs mt-1">
                {columns[targetColumn].title}에 추가됨
              </div>
            </div>,
            { duration: 3000 }
          );
          
          // 오래된 ID 정리
          if (processedCardIds.current.size > 100) {
            const idsArray = Array.from(processedCardIds.current);
            processedCardIds.current = new Set(idsArray.slice(-50));
          }
        }
      }
    }
  }, [lastMessage, columns]); // columns를 dependency에 추가

  // Socket의 kanban-update 이벤트 처리
  useEffect(() => {
    if (!socket) return;

    const handleKanbanUpdate = (update) => {
      console.log('Kanban update received:', update);
      
      // MOVE 이벤트만 처리
      if (update.type === 'MOVE') {
        setColumns(prev => {
          const card = prev[update.fromColumn]?.cards.find(
            c => c.id === parseInt(update.cardId)
          );
          if (!card) return prev;

          return {
            ...prev,
            [update.fromColumn]: {
              ...prev[update.fromColumn],
              cards: prev[update.fromColumn].cards.filter(
                c => c.id !== parseInt(update.cardId)
              )
            },
            [update.toColumn]: {
              ...prev[update.toColumn],
              cards: [...prev[update.toColumn].cards, card]
            }
          };
        });
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
      
      const cards = Array.isArray(response.data) ? response.data : response.data.cards || [];
      
      cards.forEach(card => {
        if (cardsByColumn[card.column_id]) {
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
      if (!prev[columnId]) {
        console.error('Invalid column ID:', columnId);
        return prev;
      }
      
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

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    
    if (!destination) return;
    if (source.droppableId === destination.droppableId && 
        source.index === destination.index) return;
    
    const success = await moveCardToColumn(
      draggableId, 
      source.droppableId, 
      destination.droppableId
    );
    
    if (!success) {
      toast.error('카드 이동에 실패했습니다');
    }
  };

  // 편집 모드 시작
  const startEdit = (card, e) => {
    e.stopPropagation();
    setEditingCard(card.id);
    setEditForm({
      ticker: card.ticker,
      price: card.price,
      quantity: card.quantity,
      notes: card.notes || ''
    });
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingCard(null);
    setEditForm({
      ticker: '',
      price: '',
      quantity: '',
      notes: ''
    });
  };

  // 편집 저장
  const saveEdit = async (cardId, columnId) => {
    try {
      if (!editForm.ticker || !editForm.price || !editForm.quantity) {
        toast.error('필수 항목을 모두 입력해주세요');
        return;
      }

      await apiUtils.updateKanbanCard(cardId, {
        ticker: editForm.ticker.toUpperCase(),
        price: parseFloat(editForm.price),
        quantity: parseInt(editForm.quantity),
        notes: editForm.notes,
        column_id: columnId
      });

      setColumns(prev => {
        const newColumns = { ...prev };
        const column = newColumns[columnId];
        const cardIndex = column.cards.findIndex(c => c.id === cardId);
        
        if (cardIndex !== -1) {
          column.cards[cardIndex] = {
            ...column.cards[cardIndex],
            ticker: editForm.ticker.toUpperCase(),
            price: parseFloat(editForm.price),
            quantity: parseInt(editForm.quantity),
            notes: editForm.notes
          };
        }
        
        return newColumns;
      });

      toast.success('카드가 수정되었습니다');
      cancelEdit();
    } catch (error) {
      console.error('Failed to update card:', error);
    }
  };

  // 카드 삭제
  const deleteCard = async (cardId, columnId, e) => {
    e.stopPropagation();
    
    if (!window.confirm('이 카드를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await apiUtils.deleteKanbanCard(cardId);

      setColumns(prev => ({
        ...prev,
        [columnId]: {
          ...prev[columnId],
          cards: prev[columnId].cards.filter(c => c.id !== cardId)
        }
      }));

      toast.success('카드가 삭제되었습니다');
    } catch (error) {
      console.error('Failed to delete card:', error);
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
                        isDragDisabled={editingCard === card.id}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white p-3 rounded shadow-sm transition relative group ${
                              snapshot.isDragging ? 'shadow-lg rotate-3' : ''
                            } ${editingCard === card.id ? 'ring-2 ring-blue-500' : ''}`}
                          >
                            {/* 편집/삭제 버튼 */}
                            {editingCard !== card.id && (
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <button
                                  onClick={(e) => startEdit(card, e)}
                                  className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-blue-600"
                                  title="편집"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={(e) => deleteCard(card.id, column.id, e)}
                                  className="p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-red-600"
                                  title="삭제"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}

                            {/* 편집 모드 */}
                            {editingCard === card.id ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editForm.ticker}
                                  onChange={(e) => setEditForm({ ...editForm, ticker: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm font-semibold"
                                  placeholder="티커"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editForm.price}
                                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                                    className="flex-1 px-2 py-1 border rounded text-sm"
                                    placeholder="가격"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <input
                                    type="number"
                                    value={editForm.quantity}
                                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                                    className="flex-1 px-2 py-1 border rounded text-sm"
                                    placeholder="수량"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <textarea
                                  value={editForm.notes}
                                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                  className="w-full px-2 py-1 border rounded text-sm resize-none"
                                  rows="2"
                                  placeholder="메모 (선택사항)"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={cancelEdit}
                                    className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded flex items-center"
                                  >
                                    <X size={14} className="mr-1" /> 취소
                                  </button>
                                  <button
                                    onClick={() => saveEdit(card.id, column.id)}
                                    className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded flex items-center"
                                  >
                                    <Check size={14} className="mr-1" /> 저장
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // 일반 표시 모드
                              <>
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
                              </>
                            )}
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