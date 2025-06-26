import React, { useState, useEffect, useCallback } from 'react';

// --- Utility Functions ---
const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};

const getWeekId = (date) => {
  const year = date.getFullYear();
  const weekNum = getWeekNumber(date);
  return `${year}-${String(weekNum).padStart(2, '0')}`;
};

const getDayName = (date) => {
  return date.toLocaleString('en-US', { weekday: 'long' });
};

const getMonthDay = (date) => {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
};

const getStartOfWeek = (weekId) => {
  const [year, weekNum] = weekId.split('-').map(Number);
  const jan1 = new Date(year, 0, 1);
  const days = (weekNum - 1) * 7;
  const startOfWeek = new Date(jan1.getFullYear(), jan1.getMonth(), jan1.getDate() + days - (jan1.getDay() || 7) + 1);
  // Adjust for the specific week's Monday
  if (startOfWeek.getDay() !== 1) { // If it's not Monday (1 is Monday)
    startOfWeek.setDate(startOfWeek.getDate() + (1 - startOfWeek.getDay() + 7) % 7);
  }
  return startOfWeek;
};

const getDayDate = (weekId, dayName) => {
  const startOfWeek = getStartOfWeek(weekId);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIndex = daysOfWeek.indexOf(dayName);
  const targetDate = new Date(startOfWeek);
  targetDate.setDate(startOfWeek.getDate() + dayIndex - 1); // Adjust for Monday start (startOfWeek is Monday)
  return targetDate;
};

const getWeekInfo = (weekId) => {
  const [year, weekNum] = weekId.split('-').map(Number);
  const date = getDayDate(weekId, 'Monday'); // Get a date within that week
  return { year, weekNum, display: `Week ${weekNum}` };
};

const getRelativeWeekId = (currentWeekId, offset) => {
  const [year, weekNum] = currentWeekId.split('-').map(Number);
  let newWeekNum = weekNum + offset;
  let newYear = year;

  // Handle year transitions
  if (newWeekNum > 52) { // Assuming max 52 weeks for simplicity, though some years have 53
    newWeekNum = 1;
    newYear++;
  } else if (newWeekNum < 1) {
    newWeekNum = 52; // Go back to week 52 of previous year
    newYear--;
  }

  return `${newYear}-${String(newWeekNum).padStart(2, '0')}`;
};

const generateUniqueId = () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// --- Constants ---
const CATEGORIES = {
  gym: { emoji: '💪', color: '#3674B5', name: 'Gym' }, // Primary
  meal: { emoji: '🍽️', color: '#578FCA', name: 'Meal' }, // Secondary
  study: { emoji: '📚', color: '#F5F0CD', name: 'Study' }, // 3rd Rank
  hobby: { emoji: '🎨', color: '#FADA7A', name: 'Hobby' }, // 4th Rank
  others: { emoji: '⚡', color: '#6b7280', name: 'Others' }, // Retained Gray
};

const DEFAULT_WEEKLY_TEMPLATE = {
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
};

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// --- App Component ---
function App() {
  const today = new Date();
  const initialActiveWeekId = getWeekId(today);
  const initialActiveDayName = getDayName(today);

  // State for the entire app data
  const [appData, setAppData] = useState(() => {
    try {
      const savedData = localStorage.getItem('weeklyPlannerData');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        // Validate parsedData structure to prevent errors from corrupted data
        if (parsedData && parsedData.weeks && typeof parsedData.currentWeekId === 'string' &&
            typeof parsedData.activeWeekId === 'string' && typeof parsedData.currentDayName === 'string' &&
            typeof parsedData.streak === 'number') {

          // Ensure initialActiveWeekId matches if not present or outdated
          if (!parsedData.weeks[initialActiveWeekId]) {
            const lastActiveWeekId = parsedData.activeWeekId || Object.keys(parsedData.weeks).pop();
            const newWeekTemplate = parsedData.weeks[lastActiveWeekId]?.template || DEFAULT_WEEKLY_TEMPLATE;
            parsedData.weeks[initialActiveWeekId] = {
              template: JSON.parse(JSON.stringify(newWeekTemplate)), // Deep copy
              completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy to reset completions
            };
          }

          // Ensure completions arrays exist for all days in existing weeks
          Object.keys(parsedData.weeks).forEach(weekId => {
            if (!parsedData.weeks[weekId].completions) {
              parsedData.weeks[weekId].completions = {};
            }
            Object.keys(DEFAULT_WEEKLY_TEMPLATE).forEach(day => {
              if (!parsedData.weeks[weekId].completions[day] || !Array.isArray(parsedData.weeks[weekId].completions[day])) {
                parsedData.weeks[weekId].completions[day] = [];
              }
            });
          });

          // Reset lastCompletionDate if it's a new day and no tasks were completed yesterday
          if (typeof parsedData.lastCompletionDate === 'string' && parsedData.lastCompletionDate !== today.toISOString().split('T')[0]) {
            const lastDate = new Date(parsedData.lastCompletionDate);
            const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
            // Check if no tasks were completed on the last completion date
            // This logic is tricky for streak reset, better to rely on `useEffect` daily check.
            // For initial load, if it's a new day and last completion was more than a day ago, reset.
            if (daysDiff > 1) {
                parsedData.streak = 0;
            }
          } else if (parsedData.lastCompletionDate === null) {
              // No action needed for null lastCompletionDate
          } else {
            // If it's not null and not a string (corrupted), reset it to null
            parsedData.lastCompletionDate = null;
          }

          parsedData.activeWeekId = initialActiveWeekId; // Always set to current active week
          return parsedData;
        }
      }
    } catch (e) {
      console.error("Failed to load state from localStorage or corrupted data:", e);
      // Fall through to default initial state if error occurs during parsing/validation
    }
    // Default initial state if no saved data, or saved data was corrupted/invalid
    return {
      weeks: {
        [initialActiveWeekId]: {
          template: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy
          completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy
        },
      },
      currentWeekId: initialActiveWeekId, // The week currently being viewed
      activeWeekId: initialActiveWeekId, // The actual current week based on the date
      currentDayName: initialActiveDayName,
      streak: 0,
      lastCompletionDate: null, // "YYYY-MM-DD"
    };
  });

  // State for modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'add-task', 'message'
  const [modalMessage, setModalMessage] = useState('');
  const [modalPayload, setModalPayload] = useState(null); // { dayName: 'Monday', task: {...} } for edit, etc.

  // --- Local Storage Effect ---
  useEffect(() => {
    localStorage.setItem('weeklyPlannerData', JSON.stringify(appData));
  }, [appData]);

  // --- Week Initialization/Update Effect ---
  useEffect(() => {
    const todayId = getWeekId(new Date());
    const todayName = getDayName(new Date());

    setAppData(prevAppData => {
      let updatedAppData = { ...prevAppData };
      // Always ensure activeWeekId and currentDayName are up-to-date with actual date
      updatedAppData.activeWeekId = todayId;
      // Only set currentDayName if viewing the active week
      if (updatedAppData.currentWeekId === todayId) {
        updatedAppData.currentDayName = todayName;
      }

      // Initialize new week if necessary
      if (!updatedAppData.weeks[todayId]) {
        console.log(`Initializing new week: ${todayId}`);
        const lastKnownWeekId = prevAppData.activeWeekId || Object.keys(prevAppData.weeks).pop();
        const prevWeekTemplate = prevAppData.weeks[lastKnownWeekId]?.template || DEFAULT_WEEKLY_TEMPLATE;

        updatedAppData.weeks = {
          ...updatedAppData.weeks,
          [todayId]: {
            template: JSON.parse(JSON.stringify(prevWeekTemplate)), // Deep copy
            completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Deep copy to reset completions
          },
        };
      } else {
        // Ensure completions for the current week's days are arrays on update
        Object.keys(DEFAULT_WEEKLY_TEMPLATE).forEach(day => {
          if (!updatedAppData.weeks[todayId].completions[day] || !Array.isArray(updatedAppData.weeks[todayId].completions[day])) {
            updatedAppData.weeks[todayId].completions[day] = [];
          }
        });
      }


      // Streak update logic (daily check)
      const currentIsoDate = new Date().toISOString().split('T')[0];
      if (updatedAppData.lastCompletionDate && updatedAppData.lastCompletionDate !== currentIsoDate) {
        const lastDate = new Date(updatedAppData.lastCompletionDate);
        const daysDiff = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        // Get completions for yesterday. Need to calculate yesterday's week and day.
        const yesterdayIsoDate = new Date();
        yesterdayIsoDate.setDate(yesterdayIsoDate.getDate() - 1);
        const yesterdayId = getWeekId(yesterdayIsoDate);
        const yesterdayName = getDayName(yesterdayIsoDate);

        // Safely access yesterday's completions
        const yesterdayCompletions = updatedAppData.weeks[yesterdayId]?.completions?.[yesterdayName] || [];

        if (yesterdayCompletions.length === 0 && daysDiff > 0) { // If no tasks completed yesterday and it's a new day
          updatedAppData.streak = 0;
        }
      }

      return updatedAppData;
    });
  }, []); // Run once on mount

  const currentWeekData = appData.weeks[appData.currentWeekId];
  const isHistoricalView = appData.currentWeekId !== appData.activeWeekId;

  // --- Task Operations ---
  const handleAddTask = useCallback((dayName, taskText, categoryType) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const currentWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!currentWeek) {
        console.error("Current active week data not found during add task.");
        return prevAppData;
      }

      // Ensure the template array for the specific day exists
      if (!currentWeek.template[dayName]) {
        currentWeek.template[dayName] = [];
      }

      const newTask = {
        id: generateUniqueId(),
        text: taskText,
        category: categoryType,
        emoji: CATEGORIES[categoryType]?.emoji,
      };

      currentWeek.template[dayName].push(newTask);
      // No need to add to completions, as completions tracks only IDs of *completed* tasks.
      // The template is the source of truth for all tasks.

      return newAppData;
    });
    setIsModalOpen(false);
  }, []);

  const handleToggleTaskCompletion = useCallback((dayName, taskId) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const weekToUpdate = newAppData.weeks[newAppData.currentWeekId];

      if (!weekToUpdate) {
        console.error(`Week data for ${newAppData.currentWeekId} not found during toggle completion.`);
        return prevAppData;
      }

      // Ensure the completions array for the specific day exists and is an array
      if (!weekToUpdate.completions[dayName] || !Array.isArray(weekToUpdate.completions[dayName])) {
        weekToUpdate.completions[dayName] = [];
      }
      const completedTasksForDay = weekToUpdate.completions[dayName];
      const taskIndex = completedTasksForDay.indexOf(taskId);

      if (taskIndex > -1) {
        completedTasksForDay.splice(taskIndex, 1); // Mark as uncompleted
      } else {
        completedTasksForDay.push(taskId); // Mark as completed
      }

      // Streak logic: only update if viewing the active week
      if (newAppData.currentWeekId === newAppData.activeWeekId) {
        // Ensure todayCompletions is an array before checking length
        if (!newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName] || !Array.isArray(newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName])) {
          newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName] = [];
        }
        const todayCompletions = newAppData.weeks[newAppData.activeWeekId].completions[appData.currentDayName];
        if (todayCompletions.length > 0) {
          const currentIsoDate = new Date().toISOString().split('T')[0];
          if (newAppData.lastCompletionDate !== currentIsoDate) {
            newAppData.streak += 1;
            newAppData.lastCompletionDate = currentIsoDate;
          }
        }
      }

      return newAppData;
    });
  }, [appData.currentDayName]);

  const handleEditTaskText = useCallback((dayName, taskId, newText) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const activeWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!activeWeek) {
        console.error("Active week data not found during edit task.");
        return prevAppData;
      }

      // Ensure template array for the specific day exists
      if (!activeWeek.template[dayName]) {
        activeWeek.template[dayName] = [];
      }

      const task = activeWeek.template[dayName].find(t => t.id === taskId);
      if (task) {
        task.text = newText;
      }
      return newAppData;
    });
  }, []);

  const handleDeleteTask = useCallback((dayName, taskId) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const activeWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!activeWeek) {
        console.error("Active week data not found during delete task.");
        return prevAppData;
      }

      // Ensure template array for the specific day exists
      if (!activeWeek.template[dayName]) {
        activeWeek.template[dayName] = [];
      }

      activeWeek.template[dayName] = activeWeek.template[dayName].filter(t => t.id !== taskId);
      // Also remove from completions for the current active week if present
      if (activeWeek.completions[dayName] && Array.isArray(activeWeek.completions[dayName])) {
        newAppData.weeks[newAppData.activeWeekId].completions[dayName] = activeWeek.completions[dayName].filter(id => id !== taskId);
      }
      return newAppData;
    });
  }, []);

  const handleReorderTasks = useCallback((dayName, newTasks) => {
    setAppData(prevAppData => {
      const newAppData = JSON.parse(JSON.stringify(prevAppData));
      const activeWeek = newAppData.weeks[newAppData.activeWeekId]; // Always modify active week's template

      if (!activeWeek) {
        console.error("Active week data not found during reorder tasks.");
        return prevAppData;
      }

      // Ensure template array for the specific day exists
      if (!activeWeek.template[dayName]) {
        activeWeek.template[dayName] = [];
      }

      activeWeek.template[dayName] = newTasks;
      return newAppData;
    });
  }, []);


  // --- Navigation Handlers ---
  const navigateWeeks = useCallback((offset) => {
    setAppData(prevAppData => {
      const newWeekId = getRelativeWeekId(prevAppData.currentWeekId, offset);
      // If navigating to a new week that doesn't exist, initialize its template from the *active* week's template
      if (!prevAppData.weeks[newWeekId]) {
        const currentActiveWeekTemplate = prevAppData.weeks[prevAppData.activeWeekId]?.template || DEFAULT_WEEKLY_TEMPLATE;
        return {
          ...prevAppData,
          currentWeekId: newWeekId,
          weeks: {
            ...prevAppData.weeks,
            [newWeekId]: {
              template: JSON.parse(JSON.stringify(currentActiveWeekTemplate)), // Deep copy template
              completions: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_TEMPLATE)), // Empty completions
            },
          },
        };
      }
      return { ...prevAppData, currentWeekId: newWeekId };
    });
  }, []);

  const navigateDays = useCallback((offset) => {
    setAppData(prevAppData => {
      const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      let currentIndex = daysOfWeek.indexOf(prevAppData.currentDayName);
      let newIndex = (currentIndex + offset + daysOfWeek.length) % daysOfWeek.length;
      return { ...prevAppData, currentDayName: daysOfWeek[newIndex] };
    });
  }, []);

  // --- Progress Tracking Calculations ---
  const calculateCompletionPercentage = useCallback((weekId) => {
    const week = appData.weeks[weekId];
    if (!week) return 0;

    let totalTasks = 0;
    let completedTasks = 0;

    Object.keys(week.template).forEach(day => {
      totalTasks += week.template[day]?.length || 0; // Use optional chaining and default to 0
      completedTasks += week.completions[day]?.length || 0; // Use optional chaining and default to 0
    });

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }, [appData.weeks]);

  const currentWeekInfo = getWeekInfo(appData.currentWeekId);
  const currentWeekCompletionPercentage = calculateCompletionPercentage(appData.currentWeekId);

  // --- Modals ---
  const openAddTaskModal = (dayName) => {
    if (isHistoricalView) {
      setModalMessage("Cannot add tasks to historical weeks.");
      setModalType('message');
      setIsModalOpen(true);
      return;
    }
    setModalPayload({ dayName });
    setModalType('add-task');
    setIsModalOpen(true);
  };

  const closeModals = () => {
    setIsModalOpen(false);
    setModalType(null);
    setModalMessage('');
    setModalPayload(null);
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-[#F5F0CD] font-inter text-gray-900 flex flex-col items-center p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="w-full max-w-xl bg-white rounded-xl shadow-lg p-4 mb-4 text-center">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xl font-bold text-red-500">🔥 {appData.streak}</span>
          <h1 className="text-xl font-semibold">
            {currentWeekInfo.display}
          </h1>
          <span className="text-xl font-bold text-green-600">{currentWeekCompletionPercentage}%</span>
        </div>
        <div className="flex justify-between items-center text-gray-600 text-sm mb-4">
          <button
            onClick={() => navigateWeeks(-1)}
            className="p-2 rounded-full bg-[#578FCA] text-white hover:bg-[#3674B5] transition-colors"
            aria-label="Previous week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <span>{currentWeekInfo.year}</span>
          <button
            onClick={() => navigateWeeks(1)}
            className="p-2 rounded-full bg-[#578FCA] text-white hover:bg-[#3674B5] transition-colors"
            aria-label="Next week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex justify-between items-center text-lg font-medium">
          <button
            onClick={() => navigateDays(-1)}
            className="p-2 rounded-full bg-[#578FCA] text-white hover:bg-[#3674B5] transition-colors"
            aria-label="Previous day"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <span>{appData.currentDayName}, {getMonthDay(getDayDate(appData.currentWeekId, appData.currentDayName))}</span>
          <button
            onClick={() => navigateDays(1)}
            className="p-2 rounded-full bg-[#578FCA] text-white hover:bg-[#3674B5] transition-colors"
            aria-label="Next day"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content - Day View */}
      <main className="w-full max-w-xl bg-white rounded-xl shadow-lg p-4 flex-grow relative">
        <h2 className="text-xl font-semibold mb-4 text-center">
          {appData.currentDayName}'s Tasks
          {isHistoricalView && (
            <span className="ml-2 text-sm text-gray-500">(Historical View)</span>
          )}
        </h2>
        <DayView
          tasks={currentWeekData?.template[appData.currentDayName] || []}
          completedTaskIds={currentWeekData?.completions[appData.currentDayName] || []}
          onToggleCompletion={handleToggleTaskCompletion}
          onEditTaskText={handleEditTaskText}
          onDeleteTask={handleDeleteTask}
          onReorderTasks={handleReorderTasks}
          isHistoricalView={isHistoricalView}
          categories={CATEGORIES}
          dayName={appData.currentDayName} // Pass dayName for drag/drop context
        />

        {!isHistoricalView && (
          <button
            onClick={() => openAddTaskModal(appData.currentDayName)}
            className="mt-6 w-full py-3 bg-[#3674B5] text-white font-bold rounded-xl shadow-md hover:bg-[#2A5E95] transition-colors active:scale-95 transform"
            aria-label="Add new task"
          >
            Add Task
          </button>
        )}
      </main>

      {/* Add Task Modal */}
      {isModalOpen && modalType === 'add-task' && (
        <AddTaskModal
          dayName={modalPayload?.dayName}
          onClose={closeModals}
          onAddTask={handleAddTask}
          categories={CATEGORIES}
        />
      )}

      {/* Message Modal */}
      {isModalOpen && modalType === 'message' && (
        <MessageModal
          message={modalMessage}
          onClose={closeModals}
        />
      )}
    </div>
  );
}

// --- DayView Component ---
const DayView = ({
  tasks,
  completedTaskIds,
  onToggleCompletion,
  onEditTaskText,
  onDeleteTask,
  onReorderTasks,
  isHistoricalView,
  categories,
  dayName,
}) => {
  const [draggingItem, setDraggingItem] = useState(null);

  const handleDragStart = (e, index) => {
    if (isHistoricalView) {
      e.preventDefault();
      return;
    }
    setDraggingItem(tasks[index]);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    e.target.classList.add('opacity-50');
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (!draggingItem || isHistoricalView) return;

    const sourceIndex = tasks.findIndex(task => task.id === draggingItem.id);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    const newTasks = [...tasks];
    const [movedTask] = newTasks.splice(sourceIndex, 1);
    newTasks.splice(targetIndex, 0, movedTask);

    onReorderTasks(dayName, newTasks);
    e.target.classList.remove('opacity-50');
    setDraggingItem(null);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('opacity-50');
    setDraggingItem(null);
  };

  return (
    <ul className="space-y-3 p-2 bg-gray-50 rounded-lg min-h-[300px]">
      {tasks.length === 0 ? (
        <p className="text-center text-gray-500 py-10">No tasks for today. Add some!</p>
      ) : (
        tasks.map((task, index) => (
          <li
            key={task.id}
            draggable={!isHistoricalView}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className="rounded-lg shadow-sm bg-white p-3 flex items-center gap-3 border-l-4"
            style={{ borderColor: categories[task.category]?.color || categories.others.color }}
          >
            <TaskItem
              task={task}
              isCompleted={completedTaskIds.includes(task.id)}
              onToggleCompletion={onToggleCompletion}
              onEditTaskText={onEditTaskText}
              onDeleteTask={onDeleteTask}
              isHistoricalView={isHistoricalView}
              categoryInfo={categories[task.category] || categories.others}
              dayName={dayName} // Pass dayName down to TaskItem
            />
          </li>
        ))
      )}
    </ul>
  );
};

// --- TaskItem Component ---
const TaskItem = ({
  task,
  isCompleted,
  onToggleCompletion,
  onEditTaskText,
  onDeleteTask,
  isHistoricalView,
  categoryInfo,
  dayName, // Receive dayName here
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const inputRef = React.useRef(null);

  const handleTextClick = () => {
    if (!isHistoricalView) {
      setIsEditing(true);
    }
  };

  const handleTextChange = (e) => {
    setEditText(e.target.value);
  };

  const handleTextBlur = () => {
    setIsEditing(false);
    if (editText.trim() !== '' && editText !== task.text) {
      onEditTaskText(dayName, task.id, editText); // Use the correct dayName prop
    } else {
      setEditText(task.text); // Revert if empty or no change
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      inputRef.current.blur(); // Trigger blur to save
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at the end
      inputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [isEditing, editText]);

  // Use the 4th rank color for meal background
  const mealBgColor = task.category === 'meal' ? '#FFFBF0' : 'bg-white'; // Very light yellow for meal background

  return (
    <>
      <button
        onClick={() => !isHistoricalView && onToggleCompletion(dayName, task.id)} // Use the correct dayName prop
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2
          ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300 text-transparent'}
          ${isHistoricalView ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-green-100 transition-colors'}`}
        aria-label={isCompleted ? "Mark as uncompleted" : "Mark as completed"}
        disabled={isHistoricalView}
      >
        {isCompleted && (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      <div className={`flex-1 flex items-center rounded-md p-2`} style={{ backgroundColor: mealBgColor }}>
        <span className="mr-2 text-xl flex-shrink-0">{categoryInfo.emoji}</span>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            onKeyPress={handleKeyPress}
            className="w-full p-1 border-b-2 border-indigo-400 focus:outline-none bg-transparent"
          />
        ) : (
          <span
            className={`flex-1 text-base ${isCompleted ? 'line-through text-gray-500' : ''} ${!isHistoricalView ? 'cursor-pointer' : ''}`}
            onClick={handleTextClick}
            aria-label="Edit task"
          >
            {task.text}
          </span>
        )}
      </div>

      {!isHistoricalView && (
        <button
          onClick={() => onDeleteTask(dayName, task.id)} // Use the correct dayName prop
          className="flex-shrink-0 p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors active:scale-95 transform"
          aria-label="Delete task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </>
  );
};


// --- AddTaskModal Component ---
const AddTaskModal = ({ dayName, onClose, onAddTask, categories }) => {
  const [taskText, setTaskText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(Object.keys(categories)[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (taskText.trim()) {
      onAddTask(dayName, taskText.trim(), selectedCategory);
      setTaskText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm">
        <h3 className="text-2xl font-bold mb-4 text-center">Add New Task for {dayName}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="task-text" className="block text-gray-700 text-sm font-medium mb-1">
              Task Description
            </label>
            <input
              id="task-text"
              type="text"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3674B5] focus:border-transparent"
              placeholder="e.g., Go to gym, Prepare dinner"
              required
            />
          </div>
          <div>
            <label htmlFor="task-category" className="block text-gray-700 text-sm font-medium mb-1">
              Category
            </label>
            <select
              id="task-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#3674B5] focus:border-transparent"
            >
              {Object.entries(categories).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.emoji} {value.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[#578FCA] text-white font-semibold hover:bg-[#3674B5] transition-colors active:scale-95 transform"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#3674B5] text-white font-bold hover:bg-[#2A5E95] transition-colors active:scale-95 transform"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MessageModal Component (for alert/confirm replacements) ---
const MessageModal = ({ message, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-sm text-center">
        <h3 className="text-xl font-bold mb-4">Notification</h3>
        <p className="mb-6 text-gray-700">{message}</p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-xl bg-[#3674B5] text-white font-bold hover:bg-[#2A5E95] transition-colors active:scale-95 transform"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default App;
