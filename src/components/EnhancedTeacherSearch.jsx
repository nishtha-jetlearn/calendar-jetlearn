import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FaSearch, FaUser, FaChevronDown, FaHistory, FaTimes, FaCheck } from 'react-icons/fa';
import { useDebounce } from '../hooks/useDebounce';

const EnhancedTeacherSearch = ({
  teachers,
  selectedTeacher,
  onTeacherSelect,
  loading = false,
  error = null
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState([]);
  const debouncedSearch = useDebounce(searchTerm, 200);
  
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Enhanced filtering with multiple criteria
  const filteredTeachers = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return teachers.slice(0, 10); // Show top 10 teachers when no search
    }

    const searchLower = debouncedSearch.toLowerCase().trim();
    
    return teachers
      .filter(teacher => {
        // Search by name (starts with)
        const nameMatch = teacher.full_name.toLowerCase().startsWith(searchLower);
        
        // Search by name (contains)
        const nameContainsMatch = teacher.full_name.toLowerCase().includes(searchLower);
        
        // Search by UID
        const uidMatch = teacher.uid.toLowerCase().includes(searchLower);
        
        // Search by words in name
        const nameWordsMatch = teacher.full_name.toLowerCase().split(' ').some(word => 
          word.startsWith(searchLower)
        );

        return nameMatch || nameContainsMatch || uidMatch || nameWordsMatch;
      })
      .sort((a, b) => {
        const aName = a.full_name.toLowerCase();
        const bName = b.full_name.toLowerCase();
        const searchLower = debouncedSearch.toLowerCase();
        
        // Prioritize exact name matches
        if (aName.startsWith(searchLower) && !bName.startsWith(searchLower)) return -1;
        if (!aName.startsWith(searchLower) && bName.startsWith(searchLower)) return 1;
        
        // Then alphabetical
        return aName.localeCompare(bName);
      })
      .slice(0, 20); // Limit to 20 results
  }, [debouncedSearch, teachers]);

  // Categorize results
  const categorizedResults = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return {
        recent: searchHistory.slice(0, 3),
        suggested: filteredTeachers.slice(0, 7)
      };
    }

    const searchLower = debouncedSearch.toLowerCase();
    const exactMatches = [];
    const nameMatches = [];
    const otherMatches = [];

    filteredTeachers.forEach(teacher => {
      if (teacher.full_name.toLowerCase() === searchLower) {
        exactMatches.push(teacher);
      } else if (teacher.full_name.toLowerCase().startsWith(searchLower)) {
        nameMatches.push(teacher);
      } else {
        otherMatches.push(teacher);
      }
    });

    return {
      exact: exactMatches,
      names: nameMatches,
      others: otherMatches
    };
  }, [debouncedSearch, filteredTeachers, searchHistory]);

  // Handle teacher selection
  const handleTeacherSelect = (teacher) => {
    // Show teacher name in search field, but preserve full teacher object
    setSearchTerm(teacher.full_name);
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    
    // Add to search history with full teacher object
    setSearchHistory(prev => {
      const filtered = prev.filter(t => t.id !== teacher.id);
      return [teacher, ...filtered].slice(0, 5);
    });
    
    // Pass full teacher object to parent
    console.log('🔍 Teacher selected:', teacher.full_name);
    onTeacherSelect(teacher);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    const allResults = [
      ...(categorizedResults.recent || []),
      ...(categorizedResults.exact || []),
      ...(categorizedResults.names || []),
      ...(categorizedResults.others || [])
    ];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < allResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : allResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && allResults[focusedIndex]) {
          handleTeacherSelect(allResults[focusedIndex]);
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
        searchInputRef.current?.blur();
        break;
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsDropdownOpen(true);
    setFocusedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    setIsDropdownOpen(true);
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm('');
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    onTeacherSelect(null);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update search term when selected teacher changes externally
  useEffect(() => {
    if (selectedTeacher) {
      setSearchTerm(selectedTeacher.full_name);
    } else {
      setSearchTerm('');
    }
  }, [selectedTeacher]);

  const renderTeacherItem = (teacher, index, category = '') => {
    const isSelected = selectedTeacher?.id === teacher.id;
    const isFocused = index === focusedIndex;
    
    return (
      <div
        key={`${category}-${teacher.id}`}
        onClick={() => handleTeacherSelect(teacher)}
        className={`
          p-3 cursor-pointer transition-all duration-150 border-l-4
          ${isFocused ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent hover:bg-gray-50'}
          ${isSelected ? 'bg-blue-100 border-l-blue-600' : ''}
        `}
      >
        <div className="flex items-center gap-3">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
            ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}
          `}>
            {teacher.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900 text-sm">
              {teacher.full_name}
              {isSelected && <FaCheck className="inline ml-2 text-blue-600" size={12} />}
            </div>
                                     <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>ID: {teacher.uid}</span>
            </div>
          </div>
          {category === 'recent' && (
            <FaHistory className="text-gray-400" size={12} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FaSearch className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search teachers by name or ID..."
          disabled={loading}
          className={`
            w-full pl-10 pr-10 py-3 border rounded-lg text-sm
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            ${loading ? 'bg-gray-50 cursor-not-allowed' : 'bg-white'}
            ${error ? 'border-red-300' : 'border-gray-300'}
            transition-all duration-200
          `}
        />
        
        {/* Loading/Clear button */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          ) : searchTerm ? (
            <button
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes size={14} />
            </button>
          ) : (
            <FaChevronDown 
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`} 
            />
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-1 text-xs text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {!debouncedSearch.trim() ? (
            /* No search term - show recent and suggested */
            <>
              {searchHistory.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600 flex items-center gap-2">
                      <FaHistory size={10} />
                      Recent Searches
                    </span>
                  </div>
                  {categorizedResults.recent.map((teacher, index) => 
                    renderTeacherItem(teacher, index, 'recent')
                  )}
                </div>
              )}
              
              {categorizedResults.suggested.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600">
                      Suggested Teachers
                    </span>
                  </div>
                  {categorizedResults.suggested.map((teacher, index) => 
                    renderTeacherItem(teacher, index + (searchHistory.length), 'suggested')
                  )}
                </div>
              )}
            </>
          ) : (
            /* Search results */
            <>
              {categorizedResults.exact?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                    <span className="text-xs font-medium text-green-700">
                      Exact Match
                    </span>
                  </div>
                  {categorizedResults.exact.map((teacher, index) => 
                    renderTeacherItem(teacher, index, 'exact')
                  )}
                </div>
              )}
              
              {categorizedResults.names?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                    <span className="text-xs font-medium text-blue-700">
                      Name Matches
                    </span>
                  </div>
                  {categorizedResults.names.map((teacher, index) => 
                    renderTeacherItem(teacher, index + (categorizedResults.exact?.length || 0), 'names')
                  )}
                </div>
              )}
              
              {categorizedResults.others?.length > 0 && (
                <div>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-600">
                      Other Matches
                    </span>
                  </div>
                  {categorizedResults.others.map((teacher, index) => 
                    renderTeacherItem(
                      teacher, 
                      index + (categorizedResults.exact?.length || 0) + (categorizedResults.names?.length || 0), 
                      'others'
                    )
                  )}
                </div>
              )}
              
              {filteredTeachers.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  <div className="text-sm">No teachers found</div>
                  <div className="text-xs mt-1">Try searching by name, ID, or email</div>
                </div>
              )}
            </>
          )}
          
          {/* Footer */}
          {filteredTeachers.length > 0 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
              {debouncedSearch.trim() ? 
                `${filteredTeachers.length} teacher${filteredTeachers.length !== 1 ? 's' : ''} found` :
                'Start typing to search teachers'
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedTeacherSearch; 