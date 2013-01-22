/*
* jQuery zTabs plugin
* Version 2.0.45
* @requires jQuery v1.5 - v1.9.0
*
* Copyright 2011, Steve Roberson
* roberson@zurka.com
*
* Dual licensed under the MIT or GPL Version 2 licenses just like jQuery
* http://jquery.org/license
*
* Considerable effort was put towards making the code understandable.  It's not.
*
*/

(function( $ ) {
	var settings = {
		subrowsdivid: false,
		contentdivid: false,
		imagebaseurl: 'library/images/',
		closebuttonfile: 'close_tab_button.gif',
		refreshbuttonfile: 'refresh_button.png',
		fromanchor: 'a.zTab, button.zTab, input[type="button"].zTab',
		replace: 'a.zReplace',
		formreplace: 'form.zReplace',
		formresults: '.zResults',
		localstorage: true,
		rowchange: false,
		initialized: false,
		taboverflow: true,
		
		available: true,
		cache: true,
		closeable: false,
		contenturl: false,
		label: false,
		maxlabelsize: false,
		onclose: false,
		oncreate: false,
		onsleep: false,
		onwake: false,
		parentid: false,
		refreshable: false,
		singleton: false
	};
	
	// This array helps performance of parse-the-list by focusing on the settings the tabs care about and excluding things like subrowsdivid
	var tabSettings = ['available', 'cache', 'closeable', 'contenturl', 'label', 'localstorage', 'maxlabelsize', 'onclose', 'oncreate', 'onsleep', 'onwake', 'parentid', 'refreshable', 'singleton'];

	// initial values
	var zTabsSet = 0;
	var zTabsId = 0;
	var recentTabId = '';
	var readyDfd = $.Deferred();
	
	// lock out the other tabs when one is loading
	var clickLock = false;
	var iFrameLock = false;  // IE iFrame based history
	var closebutton, refreshbutton;

	//we need to store where the top of our tabs are so we can go back there when we open a new tab
	var tabTop=0;

	// Browsers shouldn't do the caching for us
	$.ajaxSetup({
		cache: false
	});
	
	var currentLocationHash = '';

	// zTabs does not currently support multiple tabsets.  might as well declare global $root and $content variables
	var $root, $content;
	
	var methods = {
		init: function(options) {			
			// for IE history, add a hidden div to the top of the page
			if($.browser.msie) {
				$('<iframe id="zTabHistory" src="blank.html" style="display:none"></iframe>')
					.prependTo('body').load(function() { iFrameLock = false; });
			}
			
			return this.each(function() {
				if (options) { 
		        	$.extend(settings, options); // note - this precludes multiple zTab instances in a particular app, if they have different options
		      	}
	
				// Retrieve the version of localStorage.  This allows developers to changes tabIds of an existing project without leaving legacy tabs around.
				// For instance, set localstorage: 'version2' to clear out the cache of users when they come in the next time.
				if(typeof localStorage != 'undefined') {
					if(settings.localstorage != 'ignore' && settings.localstorage !== false && settings.localstorage !== true && settings.localstorage != 'clear' && localStorage.getItem('localStorageVersion') != settings.localstorage) {
						localStorage.clear();
						localStorage.setItem('localStorageVersion', settings.localstorage);
					}
				}
	
				closebutton = '<img src="'+settings.imagebaseurl+settings.closebuttonfile+'" border="0">';
				refreshbutton = '<img src="'+settings.imagebaseurl+settings.refreshbuttonfile+'" border="0">';

				$content = $('#'+settings.contentdivid)
				.on('click',settings.fromanchor, function(event) {
					event.preventDefault();	event.stopPropagation();			
					$(this).zTabs('fromAnchor').click();
				})
				.on('click', settings.replace, function(event) {
					event.preventDefault(); event.stopPropagation();
					var $that = $(this);
					$.get($that.attr('href')).then(function(data) {
						$that.zTabs('parentContent').html(data);
					});
				})
				.on('submit', settings.formreplace, function(event) {
					event.preventDefault(); event.stopPropagation();
					var $that = $(this);
					$.ajax($that.attr('action'),{ type:$that.attr('method') || 'POST', data:$that.serialize() }).done(function(data) {
						if($that.zTabs('parentContent', settings.formresults).length > 0) {
							$that.zTabs('parentContent', settings.formresults).html(data);
						} else {
							$that.zTabs('parentContent').html(data);
						}
					}).fail(function() {
						alert('Ajax error');
					});
				});
				$root = $(this).addClass('zTabs');
				
				$('#'+settings.subrowsdivid)
				.on('click', settings.fromanchor, function(event) {
					event.preventDefault();	event.stopPropagation();			
					$(this).zTabs('fromAnchor').click();
				});
				
				$(window).resize(function() {
					tabOverflowAll();
				});
				
				//store the location of the top of our tab set
				tabTop=$root.parent().offset().top;
				
				// the UL is storage for the tabSet wide information; TODO weird that this is attr instead of data, but i'm having trouble switching it to data
				$root.attr('data-ztabsset', zTabsSet).attr('data-ztabsid', zTabsId);
				zTabsSet++; 
				zTabsId++;
				for(var key in settings) {
					if(settings.hasOwnProperty(key)) {
						if(!$root.data(key)) {
							$root.data(key, settings[key]);
						}
					}
				}
				
				// Get tab data from the HTML
				// Local assignments override parameters in the set up.
				parseTheList($root, 1);

				$root.children('li').not('.zIgnore').each(function() {
					// set the click, doubleClick and close button
					setUpTab(this);
				});
				
				if(settings.localstorage == 'clear') { $root.zTabs('clear'); }
				
				
				// If the hash path is set, open the appropriate tabs
				var w, f;
				if(location.hash != '') {
					w = $root.zTabs('showPath', location.hash);
					f = function() { alert('Error: init 1'); }
				} else {
					if($root.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length == 1) {
						w = showTab($root.find('li.current, li.currentWithSecondRow, li.currentWithProgression').attr('id'));
						f = function() { alert('Error: init 2'); }
					} else {
						w = showTab($root.find('li').attr('id'));
						f = function() { alert('Error: init 3'); }
					}
				}
				$.when(w).then(function() {
					var ul = $root.zTabs('current');
					ul = ul ? ul.parent() : $root;
					$.when(rebuildList(ul)).then(function() {
						archiveList(ul);
						initialized();
					});
				}).fail(f);
				// STEVE one day there should be a way to differentiate between an app tab set and other tab sets
				if(typeof hashChecker == 'undefined') {
					var hashChecker = setInterval ("$(this).zTabs('checkHash');", 100);
				}				
			});
		},
		add: function(options) {
			var dfd = $.Deferred();
		
			var options = options || {};
			
			// By default, added tabs are closeable
			if(typeof options.closeable == 'undefined' || options.closeable != false) {
				options.closeable = true;
			}
			
			if(typeof options.label == 'undefined') {
				options.label = 'Untitled';
			}
			
			if(options.tabid) {
				var liId = options.tabid;
			} else if(options.label) {
				var liId = uniqueId(options.label);
			} else {
				// error
				alert('Error: Adding a tab requires an id or label');
				dfd.fail('Adding a tab requires an id or label');
				return dfd.promise();
			}
			
			// Set up the label.  Truncate if appropriate			
			if(typeof options.maxlabelsize != 'undefined' && options.maxlabelsize != false && options.label.length > options.maxlabelsize) {
				var title = options.label;
				options.label = options.label.substring(0,options.maxlabelsize - 3) + "...";	
			}
			
			// This can be set as show:false or added to an li as data-show='false'
			if(typeof options.show == 'undefined') {
				options.show = true;
			}
			
			// does it already exist?  If so, show it and you're done
			var $addTab = $('#'+liId);
			if($addTab.length > 0 && options.show) {
				return $addTab.zTabs('show');
			}
		
			// if parentid is set, use that as the destination li/ul.  If it's not, use the element that precedes the add call in the chain.  (meaning this)
			if(typeof options.parentid != 'undefined' && options.parentid != false && $(cleanId(options.parentid)).length > 0) {
				var $this = $(cleanId(options.parentid));
			} else {
				var $this = $(this);
			}
		
			// if an <li> was passed in, show the tab, call zTabsAdd with the <ul>
			
			if($this.is('li')) {
				// show the tab
				if($("div[data-ztabid="+$this.data('ztabid')+"_content], ul[data-ztabid="+$this.data('ztabid')+"_content]").length > 0) {
					delete options.parentid; // we've already handed moving to the parent
					return $("div[data-ztabid="+$this.data('ztabid')+"_content], ul[data-ztabid="+$this.data('ztabid')+"_content]").zTabs('add', options);
				} else {					
					$.when($this.zTabs('show')).then(function() {
						// After showing this tab, see if it has subtabs, if so, add the new tab
						if($("div[data-ztabid="+$this.data('ztabid')+"_content], ul[data-ztabid="+$this.data('ztabid')+"_content]").length > 0) {
							delete options.parentid; // we've already handed moving to the parent
							$.when($("div[data-ztabid="+$this.data('ztabid')+"_content], ul[data-ztabid="+$this.data('ztabid')+"_content]").zTabs('add', options)).then(function() {
								dfd.resolve();
							}).fail(function() {
								// the add failed
								dfd.reject();
							});
						} else {
							dfd.resolve();
						}
					}).fail(function() {
						// the show failed
						dfd.reject();
					});
				}
				return dfd.promise();
			}
			
			// It's a list
			if($this.is('ul')) {
				// TODO refactor this to be roughly a function call on $tabSet for the next unique id
				var $tabSet = $getTabSet();
				var newId = $tabSet.data('ztabsset')+"_"+$tabSet.data('ztabsid');
				$tabSet.data('ztabsid',  parseInt($tabSet.data('ztabsid'), 10)+1);

				var $newLi = $('<li id="'+liId+'" data-ztabid="'+newId+'" data-contenturl="'+options.contenturl+'" data-label="'+options.label+'"><a href="'+options.contenturl+'">'+options.label+'</a></li>');				


				// Go through the settings array and set any data that's not been set locally
				for(var i=0; i<tabSettings.length; i++) {
					var key = tabSettings[i];				
					if(options[key]) {
						$newLi.data(key, options[key]);
					} else if(!$newLi.data(key)) {
						$newLi.data(key, settings[key]);
					}
				}
				// Set the position of the tab to be added
				if(typeof options.position != 'undefined' && options.position < $this.find('li').length) {
					var position = 'li:eq('+options.position+')';
					$this.find(position).before($newLi);
				} else {
					$this.append($newLi);
				}

				// set up options
				if (!$newLi.is('.zIgnore')) { 
					setUpTab($newLi);
					if(options.show) { // show the tab
						$.when($newLi.zTabs('show')).then(function() {
							tabOverflow($this,  $newLi);
							dfd.resolve();
						}).fail(function() {
							dfd.reject();
						});
					} else {
						archiveList($this.get(0));
						tabOverflow($this,  $newLi);
						dfd.resolve();	
					}
				}

				return dfd.promise();
			}
		},
		addAndShow: function(options) {
			// Deprecated.  Showing is now the default.
			options.show = true;
			return $(this).zTabs('add', options);
		},
		cc: function(filter) {
			if(this.selector == '') {
				var $tabSet = $getTabSet();
			} else {
				var $tabSet = $(this);
			}
			
			// Convenience method for combining getting the current content
			var currentArray = [];
			if(typeof filter == 'undefined') {
				$tabSet.each(function() {
					currentArray.push($(this).zTabs('current').zTabs('content').get(0));
				});
			} else {
				$tabSet.each(function() {
					$tabSet.zTabs('current').zTabs('content', filter).each(function() {
						currentArray.push(this);
					});
				});
			}

			currentArray = $.unique(currentArray);
			return $tabSet.pushStack(currentArray);
		},		
		checkHash: function() {			
			if(clickLock || iFrameLock) {
				return;
			}

			if($('#zTabHistory').length > 0) {
				// we must be using an iFrame for IE history
				var newTab = $('#zTabHistory')[0].contentWindow.document.location.hash;
			} else {
				// FF, Safari, etc.
				var newTab = location.hash;
			}

			if(newTab != '#'+currentLocationHash && newTab != '') {
				this.zTabs('showPath',newTab);
			}	
		},
		clear: function(id) {
			if(typeof localStorage == 'undefined') {
				return;
			}
			// Clears out the local storage for a specific ul or for everything
			// One day this should be careful to only touch zTabs local storage
			var id = id || false;
			if(!id) {
				// clear out everything
				localStorage.clear();
			} else {
				localStorage.remove(id);
			}
		},
		close: function(force) {
			var force = force || false;
			var that = this;		
			var dfd = $.Deferred(); // returns a promise
			
			if (!(checkOnCloses(that) || force)) return dfd.reject().promise();
			
			var $that = $(that);
			var ul = $that.parent().get(0);
			
			// call some onclose bit that is allowed to cancel
			var commonThen = function() {
				archiveList(ul);
				tabOverflow($(ul));
				dfd.resolve();
			};
			var commonFail = dfd.reject;
			
			var showIt;
			if($that.is('.current, .currentWithSecondRow, .currentWithProgression')) {
				// if it has a child row, run the rowchange callback when this is all done
				if($that.is('.currentWithSecondRow, .currentWithProgression')) {
					dfd.then(rowChange);
				}
				var $show = $("[data-ztabid="+recentTabId+"]"),
					w = $show.is('li') ? $show : $(ul).find('li').first();
				showIt = function() { 
						$that.remove();
						$.when(w.zTabs('show')).then(commonThen).fail(commonFail)
					}
				
			} else {
				showIt = function() {
					$that.remove();
					commonThen();
				}
			}
			removeContentForTab(that);
			if($that.hasClass('hiddenTab')) { // If it's hidden, don't animate the closing
				showIt();
			} else {
				$that.addClass('disableHover').animate({'opacity':'0'}, 75).css('height','1px')
					.animate({'width':0}, 400, showIt);
			}
			
			return dfd.promise();
		},
		content: function(filter) {
			// Find the content associated with the li or ul
			var contentArray = [];
			if(this.is('ul')) {
				
				$.each(this.find('li'), function(index, value) {
					if($("div[data-ztabid="+$(value).data('ztabid')+"_content], ul[data-ztabid="+$(value).data('ztabid')+"_content]").length > 0) {
						if(typeof filter == 'undefined' || filter == '') {
							contentArray.push($("div[data-ztabid="+$(value).data('ztabid')+"_content], ul[data-ztabid="+$(value).data('ztabid')+"_content]").get(0));
						} else {
							$("div[data-ztabid="+$(value).data('ztabid')+"_content], ul[data-ztabid="+$(value).data('ztabid')+"_content]").find(filter).each(function() {
								contentArray.push(this);
							});
						}
					}
				});
			} else if(this.is('li')) {
				$.each(this, function(index, value) {				
					if($("div[data-ztabid="+$(value).data('ztabid')+"_content], ul[data-ztabid="+$(value).data('ztabid')+"_content]").length > 0) {
						if(typeof filter == 'undefined' || filter == '') {
							contentArray.push($("div[data-ztabid="+$(value).data('ztabid')+"_content], ul[data-ztabid="+$(value).data('ztabid')+"_content]").get(0));
						} else {
							$("div[data-ztabid="+$(value).data('ztabid')+"_content], ul[data-ztabid="+$(value).data('ztabid')+"_content]").find(filter).each(function() {
								contentArray.push(this);
							});
						}
					}
				});
			}
			contentArray = $.unique(contentArray);
			return this.pushStack(contentArray);
		},
		current: function() {
			if(this.selector == '') {
				var $tabSet = $getTabSet();
			} else {
				var $tabSet = $(this);
			}
			
			// Returns false if there isn't a current tab.  This can happen when the tabs load the first time
			var currentExists = false;
			// there will be multiple tabsets again one day so this supports a jQuery set as the return value
			var currentArray = [];
			$tabSet.each(function() {
				currentArray.push($getTabSet().data('currentTab'));
				if(!currentExists && typeof $getTabSet().data('currentTab') != 'undefined') {
					currentExists = true;
				}
			});
			if(currentExists) {
				currentArray = $.unique(currentArray);
				return $tabSet.pushStack(currentArray);
			} else {
				return false;
			}

		},
		fromAnchor: function(options) {
			var options = options || {};
			
			// Find the anchors if this set isn't a set of anchors.  buttons count as anchors but not for the find
			var anchors = this.first().is("a, button, input[type='button']") ? this : this.find("a");
			
			return anchors.each(function() {
				// Get the inherent options
				options.label = $(this).html();
				
				// default with fromAnchor is a closeable tab
				if(typeof options.closeable == 'undefined') {
					options.closeable = true;
				}

				if($(this).attr('href')) {
					options.contenturl = $(this).attr('href');
				} else if($(this).data('contenturl')) {
					options.contenturl = $(this).data('contenturl');
				} else {
					// Error
					alert('data-contenturl is not set.');
					return;
				}
				
				// IE translates relative URLs prematurely
				if($.browser.msie) {
					var URLArray = options.contenturl.split('#');
					if(URLArray.length > 1) {
						options.contenturl = '#'+URLArray[URLArray.length - 1];
					}
				}
				
				// hide the associated content div if it's local
				if(options.contenturl.substr(0,1) == '#') {
					$(options.contenturl).addClass('hiddenTabContent');
				}
				
				// add options and anything stored as data- to the default settings
				var tabOptions = {};
				$.extend(tabOptions, settings, options, $(this).data());

				// deal with the click
				$(this).unbind('click');

				if(tabOptions.parentid != 'undefined' && tabOptions.parentid) {
					var $ul = $(cleanId(tabOptions.parentid));
				} else {
					var $ul = $(this).zTabs('parentTab').parent();
				}
				
				$(this).click(function() {
					$ul.zTabs('add', tabOptions);
					return false;
				});
			});
		},
		isCurrent: function() {
			if(this.data('ztabid') == $($getTabSet(this.get(0)).data('currentTab')).data('ztabid')) {
				return true;
			} else {
				return false;
			}
		},
		parentContent: function(filter) {
			var filter = filter || '';
			return $(this).zTabs('parentTab').zTabs('content', filter);
		},
		parentTab: function() {
			var tabId = $(this).parents("[data-ztabid]:first").data('ztabid').split("_content")[0];
			return $('[data-ztabid='+tabId+']');
		},
		property: function(key, value) {
			// Get/set the properties of tab(s).  Works like jQuery's attr
			// accepts name, name & value or name and function
			var redraw;
			if(arguments.length == 1) {
				if(typeof key == 'object') {
					// if it's an object, set all the key, value pairs
					return this.each(function() {
						if($(this).is('ul')) {
							$(this).find('li').each(function() {
								for(k in key) {
									if(key.hasOwnProperty(k)) {
										processProperty(this, k, key[k]);
									}
								}
							});
						} else if($(this).is('li')) {
							for(k in key) {
								if(key.hasOwnProperty(k)) {
									processProperty(this, k, key[k]);
								}
							}
						}
					});
				} else {
					// get the value of the first element
					return $(this).data(key);
				}
			}
			if(arguments.length == 2) {
				return this.each(function() {
					if($(this).is('ul')) {
						$(this).find('li').each(function() {
							processProperty(this, key, value);
						});
					} else if($(this).is('li')) {
						processProperty(this, key, value);
					}
				});
			}
		},
		ready: function(id) {
			return readyDfd.promise();
		},
		refresh: function() {
			// returns a deffered object
			var dfd = $.Deferred();
			var limit = this.length;
			var count = 0;
			// Only resolve after each item in the array has been processed
			var progress = function() {
				count++;
				if(count >= this.length) {
					dfd.resolve();
				}
			};

			// at the moment this only supports content, not subtabs		
			this.each(function() {
				var $li = $(this); // for use inside the get
			
				// Are we trying to refresh a tab that has subtabs?
				if($("ul[data-ztabid="+$li.data('ztabid')+"_content]").length) {
					// blow it away and show this tab
					removeContentForTab($li);
					if(jQuery.inArray($li.attr('id'), tabAncestors($li.zTabs('current'))) != -1) {
						$.when($li.zTabs('show',true)).then(progress);
					} else {
						progress();
					}
				} else {
					// if contenturl doesn't start with #, ajax for the content
					if($(this).data('contenturl').substr(0,1) != '#') {
						// check to see that content exists.  if not, don't refresh something that's never been loaded
						if($("div[data-ztabid="+$li.data('ztabid')+"_content], ul[data-ztabid="+$li.data('ztabid')+"_content]").length > 0) {
							$.get($(this).data('contenturl')).success(function(data) {
								$("div[data-ztabid="+$li.data('ztabid')+"_content], ul[data-ztabid="+$li.data('ztabid')+"_content]").html(data);
								progress();
							}).fail(dfd.reject);
						} else {
							dfd.reject();
						}
					}
				}
			});
			return dfd.promise();
		},
		show: function() {
			var refresh = refresh || false;
			var dfd = $.Deferred();

			if(checkOnSleeps(this)) {
				// only open the tabs that aren't already open (hence the subtraction)
				var diff = arraySubtraction(tabAncestors(this), tabAncestors($getTabSet(this).data('currentTab')));				
				if(diff.length == 0) {
					dfd.resolve();
				} else {
					var $that = $(this);
					$.when(showTab(diff)).then(function() {
						archiveList($that.parent());
					}).fail(function() {
						var goBackToThisTab = $getTabSet().zTabs('current');
						// Set the currentTab to the one we tried to go to, just so we can jump back
						// Otherwise zTabs thinks we already on the tab we are trying to do to
						$getTabSet().data('currentTab', $that.get(0));
						
						$.when($(goBackToThisTab).zTabs('show')).always(dfd.reject);
					}).done(dfd.resolve);
				}
			} else {
				dfd.reject();
			}
			return dfd.promise();
		},
		showPath: function(path) {
			var path = path || '';
			var dfd = $.Deferred();

			if(checkOnSleeps(this) || path != '') {
				var tabPath = path.split('/');
				if(tabPath.length < 1) {
					return dfd.reject().promise();
				}
				if(tabPath[0] == '#' || tabPath[0] == '') {
					tabPath.shift(); // remove the #
				}
				$.when(showTab(tabPath)).fail(dfd.reject).done(dfd.resolve);
			} else {
				dfd.reject();
			}
			return dfd.promise();
		},
		tabOverflowAll: function() {
			tabOverflowAll();
		}
	};
	
	$.fn.zTabs = function(method) {
		// Method calling logic
		if ( methods[method] ) {
			return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else if ( typeof method === 'object' || ! method ) {
			return methods.init.apply( this, arguments );
		} else {
			$.error( 'Method ' +  method + ' does not exist on jQuery.zTabs' );
		}    
	};
	
	// HERE TEMPORARILY FOR BACKWARD COMPATIBILITY
	$.fn.zTabsCC = function(filter) {
		 return $(this).zTabs('cc', filter);
	};
	$.fn.zTabsProperty = function(obj) {
		var lcKeys = {};
		for(var key in obj) {
			if(obj.hasOwnProperty(key)) {
				lcKeys[key.toLowerCase()] = obj[key];
			}
		}
		return $(this).zTabs('property', lcKeys);
	};
	$.fn.zTabsCC = function(filter) {
		 return $(this).zTabs('cc', filter);
	};

	//
	// Walk through the list items and set up their initial values
	//
	function parseTheList($o, rowNumber) {
		// first add the row class
		$o.addClass('row'+rowNumber), 
		// find the top <ul> for this tabSet
		topUl = $o.data('ztabsset') ? $o : $getTabSet($o);
			
		// Add the settings here then override any with local content
		$o.children('li').not('.zIgnore').each(function() {
			var $li = $(this), $a = $li.find('a');
			if(!$a.length) { // Carl doesn't like to put in anchor tags when he's using data-label and data-contenturl
				$a = $('<a></a>').appendTo($li);
			}
			
			// suck up any info we need for this li
			if(! $li.data('contenturl') ) { $li.data('contenturl', $a.attr('href')); }
						
			$li.attr('data-ztabid',$(topUl).data('ztabsset')+"_"+$(topUl).data('ztabsid'));
			$(topUl).data('ztabsid', $(topUl).data('ztabsid')+1);  // ++
			
			// IE turns a href like #something into http://www.zurka.com/theCurrentPage.php#something once
			// the href enters the DOM.  This is the wrong place to make that conversion from relative to absolute in IMHO
			// For the tabs, it messes up contenturl.  Local content no longer starts with a #
			if($.browser.msie) {
				var URLArray = $li.data('contenturl').split('#');
				if(URLArray.length > 1) {
					$li.data('contenturl', '#'+URLArray[URLArray.length - 1]);
				}
			}	
				
			// Go through the settings array and set any data that's not been set locally
			// TODO have separate tab settings default to replace below with
			// $li.data($.extend({},defTabSet,$li.data()));
			for(var i=0; i<tabSettings.length; i++) {
				if(! $li.data(tabSettings[i]) ) {
					$li.data(tabSettings[i], settings[tabSettings[i]]);
				}
			}

			// what is the label for this tab
			if($li.data('label')) {
				$a.html($li.data('label'));
			} else {
				$li.data('label', $a.html());
			}
			
			// Set up the label.  Truncate if appropriate			
			if($li.data('maxlabelsize')) {
				if($li.data('label').length > $li.data('maxlabelsize')) {
					var title = $li.data('label');
					$li.data('label', $li.data('label').substring(0,$li.data('maxlabelsize') - 3) + "...");
					$a.attr({title:title}).html($li.data('label'));	
				}
			}
			
			if($li.attr("id") == '') {
				$li.attr({id:uniqueId($li.data('label'))});
			}

			// hide the associated content div if it's local
			// add the ztabid
			if($li.data('contenturl').substr(0,1) == '#') {
				var $new = $($li.data('contenturl')).addClass('hiddenTabContent').attr({'data-ztabid':$li.attr('data-ztabid')+'_content'});

				// If it points to a ul, then parse that list and set up the subtabs
				if($new.is('ul')) {
					parseTheList($new, Number(whichRow($li.parent())+1));
					
					$new.children('li').not('.zIgnore').each(function() {
						// set the click, doubleClick and close button
						setUpTab(this);
					});
				}
			}
		});
		
		// Check to see if the tabs are overflowing in this ul
		tabOverflow($o);
	}

	// Bind the appropriate actions to clicking on the tabs
	function setUpTab(li) {
		// when the link for the tab is clicked: this is where much of the work happens
		// STEVE do we need to unbind things first?  Are you sure?
		var $li = $(li);
		$li.find('a').unbind('click').click(function(event) {
			event.preventDefault();	
			if(clickLock) {
				return false;
			}
			
			if($li.data('available') == false) {
				return false;
			}
			
			if(checkOnSleeps(li)) {
				$li.zTabs('show');
			}			
			return false;
		});
		
		// add a refreshbutton if it's set as refreshable
		addRefreshButton(li);
		// add a closebutton if it's set as closeable
		addCloseButton(li);
	}
	
	function addRefreshButton(li) {		
		var $li = $(li);
		if($li.data('refreshable') && !$li.find('.refreshTabButton').is('a')) {
			$li.find('a:last').addClass('closeTabText');
			$li.prepend('<a class="refreshTabButton" onclick="$(this).parent().zTabs(\'refresh\');return false;" href="#">'+refreshbutton+'</a>');
		} else if(!$li.data('refreshable') && !$li.data('closeable')) {
			$li.find('a:last').removeClass('closeTabText');
		}
	}

	function addCloseButton(li) {
		var $li = $(li);
		if($li.data('closeable') && !$li.find('.closeTabButton').is('a')) {
			$li.find('a:last').addClass('closeTabText');
			$li.prepend('<a class="closeTabButton" onclick="$(this).parent().zTabs(\'close\');return false;" href="#">'+closebutton+'</a>');
		} else if(!$li.data('refreshable') && !$li.data('closeable')) {
			$li.find('a:last').removeClass('closeTabText');
		}
	}
	
	//
	// Support zTabsProperty by assigning properties to the li(s)
	//
	function processProperty(li, key, value) {
		var key = key.toLowerCase();
		var $li = $(li);
		$(li).data(key, value);
		
		// some changes will require a rewritten tab
		if(key=='contenturl') {
			$li.find('a').attr('href', value);
		}
		if(key=='tabid') {
			$li.attr('id', value);
		}
		if(key=='label') {
			$li.find('a[class!="closeTabButton"]').html(value);
			addCloseButton(li);
		}
		if(key=='closeable') {
			addCloseButton(li);
		}
		if(key=='available') {
			if(value === true || value == 'true') {
				$li.removeClass('unavailable').addClass('available').data('available',true);
			} else {
				$li.removeClass('available').addClass('unavailable').data('available',false);
			}
		}
	}
	
	// 
	// This is where the work gets done to show a tab and any subtabs below it.
	// The recursion and all the branching can make it intimidating, but don't be discouraged.
	//
	function showTab(tabArray) {
		// Accepts a single id or an array of them.  It returns a promise.		
		var dfd = $.Deferred();
		
		if(!tabArray) return dfd.reject().promise(); // complain if asked to show nothing
		
		var tabArray = typeof tabArray == 'string' ? [tabArray] : tabArray;
	
		// Set the recentTabId
		if($(this).zTabs('current')) {
//			$('.zTabsFORGETTING').removeClass(zTabsFORGETTING);
//			$('.zTabsLAST').addClass('zTabsFORGETTING').removeClass('zTabsLAST');
//			$(this).zTabs('current').addClass('zTabsLAST');
			recentTabId = $(this).zTabs('current').data('ztabid');
		}

		// set clickLock
		clickLock = true;
		var nextTabId = cleanId(tabArray.shift());		
		var $nextTabId = $(nextTabId);
		
		// Singleton Support
		if($nextTabId.data('singleton')) {
			var ztId = $nextTabId.data('ztabid');
			$('[data-singleton='+$nextTabId.data('singleton')+']').each(function() {
				// does it have content loaded
				var $tryContent = $('[data-ztabid='+$(this).data('ztabid')+'_content]');
				if($tryContent.length == 1) {
					$tryContent.attr('data-ztabid', ztId+'_content');
					return false;
				}
			});
		}
		
		// when this is all done, run the rowchange callback
		dfd.then(function() {
			tabOverflowAll();  // this is not very effeceint but it kills a bug
			rowChange();
		});
	
		if($nextTabId.length < 1) {
			// the tab doesn't exist
			// perhaps a path got passed in that isn't currently valid, we might need to get the tab from local storage, etc.
			var $ul = $getTabSet();
			$ul = $ul.zTabs('current') ? $('.currentSubTabs:last') : $ul;
			$.when(rebuildList($ul)).then(function() {
				if($ul.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length != 1) {
					// give up.  show the first tab
					var thisId = $ul.find('li:first').attr('id');
					$.when($ul.find('li:first').zTabs('show')).fail(dfd.reject).done(dfd.resolve);
				} else {
					dfd.resolve();
				}
			});
			return dfd.promise();
		}	
		var $tar = $("[data-ztabid="+$nextTabId.data('ztabid')+"_content]");
		// if already has the content and it's already being shown, update the classes.  Otherwise, there's a bunch of work to do
		if ($tar.length == 1 && ($nextTabId.hasClass('current') || $nextTabId.hasClass('currentWithSecondRow') || $nextTabId.hasClass('currentWithProgression')) ) {
			// the tab was already set, make sure it's content is showing
			$getTabSet(nextTabId).data('currentTab', $nextTabId.get(0));
			$tar.removeClass('hiddenTabContent').addClass($tar.is('ul') ? 'currentSubTabs' : 'currentTabContent');
			var w;
			// If there's another tab in the array, deal with it
			if(tabArray.length > 0) {
				w = showTab(tabArray);
			} else if (($nextTabId.hasClass('currentWithSecondRow') || $nextTabId.hasClass('currentWithProgression')) && $tar.find('li.current').length < 1) {
				// The current tab has child tabs but none of them are current.  This is probably because the current one was just closed
				w = showTab($tar.find('li').attr('id'));
			} else if (($nextTabId.hasClass('currentWithSecondRow') || $nextTabId.hasClass('currentWithProgression')) && $tar.find('li.current').length == 1) {
				w = showTab($tar.find('li.current').attr('id'));
			} 
			if (w) {
				$.when(w).fail(dfd.reject).done(dfd.resolve);
			} else {
				clickLock = false;
				updateURL(nextTabId);
				onCreate(nextTabId);
				onWake(nextTabId);
				dfd.resolve();
			}
		} else {
			var $parent = $nextTabId.parent(); 
			// hide current tab's, sub tabs
			$parent.find('.currentWithSecondRow, .currentWithProgression').each(function () {
				hideSubTabs(this);
			});

			var tabSetNumber = $nextTabId.data('ztabid').substr(0,1);
			$('.currentTabContent[data-ztabid^="'+tabSetNumber+'"]').removeClass('currentTabContent').addClass('hiddenTabContent');

			// change previous tab, that's a sibling, remove the closebutton if it has one
			
			if($parent.is('.currentWithProgression')) {
				$parent.find('.current').addClass('available').removeClass('current');
			} else {
				$parent.find('.current').removeClass('current');
			}
			
			$parent.find('.currentWithSecondRow').removeClass('currentWithSecondRow');
			$parent.find('.currentWithProgression').removeClass('currentWithProgression');

			// show current tab, sub tabs and current content
			// Add some clarity to the code by setting up this variable
			var contenturl = $nextTabId.data('contenturl');
			// Local Content
			if(contenturl.substr(0,1) == '#') {
				$tar = $(contenturl);
				// Is it a list for subtabs
				if($tar.is('ul')) {
					// set class for ul
					$tar.removeClass('hiddenTabContent').addClass('currentSubTabs').addClass('zTabs');
					$nextTabId.addClass($tar.is('.zTabsProgression') ? 'currentWithProgression' : 'currentWithSecondRow');
	
					syncOverflow($parent.find('.overflowTab'));

					$getTabSet(nextTabId).data('currentTab', $nextTabId.get(0));
					// parse the list the first time it needs to be rendered
					if(!$tar.children('li').not('.zIgnore').data('ztabid')) {
						parseTheList($tar, Number(whichRow($parent)+1));
						$tar.children('li').not('.zIgnore').each(function() {
							// set the click, doubleClick and close button
							setUpTab(this);
						});
					}

					onCreate(nextTabId);
					onWake(nextTabId);
					
					// find the next tab, the one already set to current, or set the first one in the list
					var w, d = dfd.resolve;
					if(tabArray.length > 0) {
						w = showTab(tabArray);
					} else if($tar.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length == 1) {
						w = showTab($tar.find('li.current, li.currentWithSecondRow, li.currentWithProgression').attr('id'));
					} else {
						w = rebuildList($tar.get(0));
						d = function() {
							if($tar.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length >= 1) {
								dfd.resolve();
							} else {
								// give up.  show the first tab
								$.when(showTab($tar.find('li').attr('id'))).then(function() {
									dfd.resolve();
								}).fail(function() {
									dfd.reject();
								});
							}
						};
					}
					$.when(w).fail(dfd.reject).done(d);
				} else {					
					// label the content div
					if(!$tar.attr('data-ztabid')) {
						$tar.attr('data-ztabid', $nextTabId.data('ztabid')+'_content');
					}

					loadingTabComplete($nextTabId);
					$nextTabId.addClass('current');
					$getTabSet(nextTabId).data('currentTab', $nextTabId.get(0));
					syncOverflow($parent.find('.overflowTab'));

					// set the class.  
					$tar.removeClass('hiddenTabContent').addClass('currentTabContent');

					clickLock = false;
					updateURL(nextTabId);
					onCreate(nextTabId);
					onWake(nextTabId);
					dfd.resolve();
				}
			}
			else {
				// Remote content
				var $tar = $("div[data-ztabid="+$nextTabId.data('ztabid')+"_content], ul[data-ztabid="+$nextTabId.data('ztabid')+"_content]").first(); // there can be only one
				if($nextTabId.data('cache') && $tar.length) {
					// It is cached
					// For any case, we need to replace loading with the label
					loadingTabComplete($nextTabId);
					
					clickLock = false;

					if($tar.is('ul')) {
						// It's a list
						$nextTabId.addClass($tar.is('.zTabsProgression') ? 'currentWithProgression' : 'currentWithSecondRow');
															
						syncOverflow($parent.find('.overflowTab'));
						if($.browser.msie && $.browser.version.substr(0,1) < 8) {
							// IE 6/7 can't handle this well
						} else {
							$tar.css({display:'none'});
						}
						$tar.removeClass('hiddenTabContent').addClass('currentSubTabs');
						onWake(nextTabId);
				
						// find the next tab, the one already set to current, or set the first one in the list
						var $newUL = $("ul[data-ztabid="+$nextTabId.data('ztabid')+"_content]");
						// Slide open the tab once everything is finished
						dfd.then(function() {
							if($.browser.msie && $.browser.version.substr(0,1) < 8) {
								// IE 6/7 can't handle this well
							} else {
								$tar.slideDown('fast', function() {
									$tar.css('display', '');
									tabOverflow($tar);
								});
							}
						});
						var w, d = dfd.resolve;
						if(tabArray.length > 0) {
							w = showTab(tabArray);
						} else if($tar.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length == 1) {
							w = showTab($tar.find('li.current, li.currentWithSecondRow, li.currentWithProgression').attr('id'));
						} else {
							// rebuild and try again
							w = rebuildList($tar.get(0));
							d = function() {
								if($tar.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length == 1) {
									dfd.resolve();
								} else {
									// give up.  show the first tab
									$.when(showTab($tar.find('li').attr('id'))).then(function() {
										dfd.resolve();
									}).fail(function() {
										dfd.reject();
									});
								}
							}
						}
						$.when(w).done(d).fail(dfd.reject);
					} else {
						// just content
						$nextTabId.addClass('current');
						syncOverflow($parent.find('.overflowTab'));
						
						$getTabSet(nextTabId).data('currentTab', $nextTabId.get(0));					
						$tar.removeClass('hiddenTabContent').addClass('currentTabContent');
						clickLock = false;
						updateURL(nextTabId);
						onWake(nextTabId);
						dfd.resolve();
					}
				}
				else {
					// Go get that remote data
					loadingTab(nextTabId);
					
					//we're opening a new tab, so we want to scroll to the top of the page for to be seeing our new content
					if ($nextTabId.data('cache')) {
						if ($(window).scrollTop() > tabTop){
							$(window).scrollTop(tabTop);
						}
					}
					
					$.when(fetchData(contenturl)).then(function(data) {						
						var regEx = /^\s*(<ul[\s\S]*?<\/ul>)([\s\S]*)/;  // look for this pattern: <optional white-space> <ul> <content>
						var matchArray = data.match(regEx);
						if(matchArray) {
							// IT'S A LIST
							var dataUl = matchArray[1];
							var dataContent = matchArray[2];
							var scriptTag = '';

							// Remove the scripts from the content so they can be added
							// after everything else is set up. This doesn't handle multiple <script> tags
							var regEx4Script =  /^([\s\S]*)(<script[\s\S]*?<\/script>)([\s\S]*)/;
							var contentArray = dataContent.match(regEx4Script);
							if(contentArray) {
								scriptTag = contentArray[2];
								dataContent = contentArray[1]+contentArray[3];
							}

							var contentdivid = $getTabSet(nextTabId).data('contentdivid');
							var subrowsdivid = $getTabSet(nextTabId).data('subrowsdivid');

							if($(dataUl).hasClass('zTabsProgression')) {
								// There's a progression as subtabs
								$nextTabId.addClass('currentWithProgression');
							} else {
								// regular old subtabs
								$nextTabId.addClass('currentWithSecondRow');
							}
							
							syncOverflow($parent.find('.overflowTab'));
							
							// STEVE, you were playing with sliding down here
							if($.browser.msie && $.browser.version.substr(0,1) < 8) {
								// IE 6/7 can't handle this well
							} else {
								dataUl = dataUl.replace(/\<ul/i, "<ul style='display:none'");
							}
							// dataUl = document.createTextNode(dataUl);
							// $(dataUl).find(ul).css({display:'none'}).attr({foo:'bar'});							

							if(subrowsdivid != '') {
								// if subrowsdivid exists we need find it in subrowsdivid
								$('#'+subrowsdivid).append(dataUl);
								var $newUL = $('#'+subrowsdivid).find('ul:last');
							} else {
								// otherwise it will just be after the one we're working on 
								$nextTabId.parent().after(dataUl);
								var $newUL = $nextTabId.parent().next();
							}
							
							$newUL.addClass('currentSubTabs').attr('data-ztabid', $nextTabId.data('ztabid')+'_content');
							$newUL.attr('id',nextTabId.substr(1)+"_zSubTabs");
							// set class for ul
							$newUL.removeClass('hiddenTabContent').addClass('zTabs');

							// $newUL.slideDown('slow');

							// currentTab = li;
							$getTabSet(nextTabId).data('currentTab', $nextTabId.get(0));

							// Put the content in the DOM.  This needs to happen before parseTheList is called
							// so that a list with local content has a chance to hide that content.  It's not ideal.
							if(contentdivid != '') {
								$('#'+contentdivid).append(dataContent);
							} else {
								$nextTabId.parent().after(dataContent);
							}

							parseTheList($newUL, Number(whichRow($nextTabId.parent())+1));

							$newUL.children('li').not('.zIgnore').each(function() {
								// set the click, doubleClick and close button
								setUpTab(this);
							});					

							loadingTabComplete($nextTabId);
							clickLock = false;

							// if(contentdivid != '') {
							// 	$('#'+contentdivid).append(dataContent);
							// } else {
							// 	$nextTabId.parent().after(dataContent);
							// }

							// Slide open the tab once everything is finished
							dfd.then(function() {
								if($.browser.msie && $.browser.version.substr(0,1) < 8) {
									// ie6/7 are too slow for the sliding
									$newUL.css({display:''});
									// if(contentdivid != '') {
									// 	$('#'+contentdivid).append(dataContent);
									// } else {
									// 	$nextTabId.parent().after(dataContent);
									// }
								} else {
									$newUL.slideDown('fast', function() {
										// if(contentdivid != '') {
										// 	$('#'+contentdivid).append(dataContent);
										// } else {
										// 	$nextTabId.parent().after(dataContent);
										// }
										$(this).css('display', '');
										tabOverflow($(this));
									});
								}
							});
					
							// add the script tags back, script tag for a list?  I guess but where does it go, there is no content
							if(scriptTag != '') {
								$nextTabId.zTabs('cc').append(scriptTag);
							}						
							onCreate(nextTabId);
							onWake(nextTabId);

							// find the next tab, the on already set to current, or set the first one in the list
							if(tabArray.length > 0) {
								$.when(showTab(tabArray)).then(function() {
									dfd.resolve();
								}).fail(function() {
									dfd.reject();
								});
							} else if($newUL.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length == 1) {
								$.when(showTab($newUL.find('li.current, li.currentWithSecondRow, li.currentWithProgression').attr('id'))).then(function() {
									dfd.resolve();
								}).fail(function() {
									dfd.reject();
								});
							} else {

								// rebuild and try again
								$.when(rebuildList($newUL.get(0))).then(function() {
									if($newUL.find('li.current, li.currentWithSecondRow, li.currentWithProgression').length == 1) {
										dfd.resolve();
									} else {
										// give up.  show the first tab
										$.when(showTab($newUL.find('li:first').attr('id'))).then(function() {
											dfd.resolve();
										}).fail(function() {
											dfd.reject();
										});
									}
								}).fail(function() {
									dfd.reject();
								});
								// return dfd.promise();
							}					
						}
						else {
							// NOT A LIST, MUST BE CONTENT FOR A SINGLE TAB
							$getTabSet().data('currentTab', $nextTabId.get(0)); // STEVE is there a better place for this step?
							
							// if the div exists, replace its content, otherwise create a new div 
							if($("div[data-ztabid="+$nextTabId.data('ztabid')+"_content]").length) {
								$("div[data-ztabid="+$nextTabId.data('ztabid')+"_content]").html(data).removeClass('hiddenTabContent').addClass('currentTabContent');
							} else {
								// create the div and place content in it
								var newDiv = document.createElement('div');
								newDiv.className = 'currentTabContent';
								$(newDiv).attr('data-ztabid', $nextTabId.data('ztabid')+'_content');
								var contentdivid = $getTabSet(nextTabId).data('contentdivid');
								if(contentdivid != '') {
									// put the new div inside the designated content div
									$('#'+contentdivid).append(newDiv);
								} else {
									$nextTabId.parent().parent().append(newDiv);
								}
								$("div[data-ztabid="+$nextTabId.data('ztabid')+"_content]").html(data);				
							}
							loadingTabComplete($nextTabId);
							$nextTabId.addClass('current');
							
							syncOverflow($nextTabId.parent().find('.overflowTab'));
							clickLock = false;
							updateURL(nextTabId);
							onCreate(nextTabId);
							onWake(nextTabId);
							dfd.resolve();
						}
					}).fail(function() {
						dfd.reject();
					});
				}
			}
		}
		return dfd.promise();
	}	
	
	function fetchData(contenturl) {
		var dfd = $.Deferred();	
		// Is it trying to use JSONP?  
		if(contenturl.indexOf('?') != -1 && contenturl.indexOf('?') != contenturl.lastIndexOf('?')) {
			// there is more than one ? in this URL
			$.when($.getJSON(contenturl)).then(function(data) {
				dfd.resolve(data.html);
			}).fail(function() {
				dfd.fail();
			});
		} else {
			// go get it via ajax
			$.when($.get(contenturl)).then(function(data) {
				dfd.resolve(data);
			}).fail(function(jqXHR, textStatus, errorThrown) {
				alert(textStatus+": "+errorThrown);			
				dfd.reject();
			});
		}
		return dfd.promise();	
	}
	
	function $getTabSet(li) { 
		// This accepts a DOM reference to a list item or the ID of the list item
		// Currently the argument doesn't matter.  At one time zTabs supported multiple instances of itself on a page
		// That support was taken out when History was added in.  One day I'll add it back, if people need it.
		return $('[data-ztabsset=0]');
	}
	
	function tabAncestorsToPath(li) {
		var zIdArray = tabAncestors(li);
		var path = '/'+zIdArray.join('/');
		return path;
	}
	
	function tabAncestors(li, zIdArray) {
		// builds array from lowest level to top level
		var zIdArray = zIdArray || new Array();
		zIdArray.unshift($(li).attr('id'));
		
		// jQuery 1.9 returns object instead of undefined so a second check is added for null data
		if(typeof $(li).parent().data('ztabid') !== 'undefined' && $(li).parent().data('ztabid') != null) {
			var liId = $(li).parent().data('ztabid').split("_");
			$("li[data-ztabid="+liId[0]+"_"+liId[1]+"]").each(function () {
				return tabAncestors(this, zIdArray);
			});
		}
		return zIdArray;
	}
	
	
	function tabDecendants(li, zIdArray) {
		// builds array from current level to the lowest level
		var zIdArray = zIdArray || new Array();
		zIdArray.push($(li).data('ztabid'));
		$("ul[data-ztabid="+$(li).data('ztabid')+"_content]").find('.current, .currentWithSecondRow, .currentWithProgression').each(function() {
			return tabDecendants(this, zIdArray);
		});
		return zIdArray;
	}

	// Utility
	function arraySubtraction(array1, array2) {
		var returnArray = new Array();
		for(var i=0; i<array1.length; i++) {
			if(jQuery.inArray(array1[i], array2) == -1) {
				returnArray.push(array1[i]);
			}
		}
		return returnArray;
	}

	function checkOnSleeps(newTab) {		
		// find the ancestors that the current tab doesn't have in common with the new tab
		// these are the ones that need to close
		var closeTabs = arraySubtraction(tabAncestors($getTabSet(newTab).data('currentTab')), tabAncestors(newTab));

		var sleepResult = true;
		for(var i=0; i<closeTabs.length; i++) {
			if(typeof $("#"+closeTabs[i]).data('onsleep') == 'function') {
				sleepResult = $("#"+closeTabs[i]).data('onsleep')();
			}
			if(!sleepResult) {
				break;
			}
		}
		// remove the contents for tabs that are going to sleep and cache=false
		if(sleepResult) {
			for(var i=0; i<closeTabs.length; i++) {
				if($("#"+closeTabs[i]).data('cache') == false) {
					removeContentForTab($("#"+closeTabs[i]).get(0));
				}
			}
		}
		
		return sleepResult;
	}
	
	function hideSubTabs(li) {
		$("ul[data-ztabid="+$(li).data('ztabid')+"_content]").find('.currentWithSecondRow, .currentWithProgression').each(function () {
			hideSubTabs(this);
		});
		$("ul[data-ztabid="+$(li).data('ztabid')+"_content]").removeClass('currentSubTabs').addClass('hiddenTabContent');
	}
	
	function loadingTab(nextTabId) {
		$(nextTabId).find('a:last').parent().addClass('pending');
		//$(nextTabId).find('a:last').css({color:'#948e7e'});
	}
	
	function loadingTabComplete($nextTabId) {
		$nextTabId.find('a:last').parent().removeClass('pending');
		//$(nextTabId).find('a:last').css({color:''});
	}
	
	function removeContentForTab(li) {
		var $li = $(li);
		
		// if it's a singleton, reassign the zTabId if possible
		var contentConvert = '';
		if($li.data('singleton')) {
			$('[data-singleton='+$li.data('singleton')+']').each(function() {
				if($(this).data('ztabid') != $li.data('ztabid')) {
					// we found another singleton by the same name
					contentConvert = $(this).data('ztabid')+'_content';
					return false;
				}
			});
		}

		var $tar = $('[data-ztabid="'+$li.data('ztabid')+'_content"]');
		if(contentConvert) {
			// it's a singleton.  convert it
			$tar.attr('data-ztabid', contentConvert).addClass('hiddenTabContent').removeClass('currentTabContent');
		} else {
			;
			$tar.filter('ul').find('li').each(function() { removeContentForTab($(this)); });
			$tar.remove();
		}
	}
	
	// TODO refactor close as custom event (ztab.close or some such)
	// first handler: trigger event on all subordinates
	function checkOnCloses(closeTab) {
		// This tab and every subtab has a chance to thwart the closing 
		var closeTabs = tabDecendants(closeTab);
		var closeResult = true;
		for(var i=0; i<closeTabs.length; i++) {
			$("li[data-ztabid="+closeTabs[i]+"]").each(function() {
				if(typeof $(this).data('onclose') == 'function') {
					closeResult = $(this).data('onclose')(this);
				}
			});
			if(closeResult === false) {
				break;
			} else {
				// be tolerant of those who don't return a value
				closeResult = true;
			}
		}
		return closeResult;		
	}
	
	// TODO refactor create as custom event (ztab.create or some such)
	// if devs want to register handlers, they can, and this can go away
	function onCreate(tabId) {
		if(typeof $(tabId).data('oncreate') == 'function') {		
			$(tabId).data('oncreate')($(tabId).zTabs('content'));
			$(tabId).data('oncreate', null);
		}
	}
	
	// TODO refactor wake as custom event (ztab.wake or some such)
	// if devs want to register handlers, they can, and this can go away
	function onWake(tabId) {
		if(typeof $(tabId).data('onwake') == 'function') {
			$(tabId).data('onwake')($(tabId).zTabs('content'));
		}
	}
	
	function updateURL(li) {
		currentLocationHash = tabAncestorsToPath(li);
		if(!clickLock) {
			if($('#zTabHistory').length > 0) {
				// we must be using the iFrame for IE history
				if($('#zTabHistory').attr('src').search(/blank.html/) > -1) {
					var file = 'blank2.html';
				} else {
					var file = 'blank.html';
				}
				iFrameLock = true;
				$('#zTabHistory').attr({src:file+"#"+currentLocationHash});				
			}
			location.hash = currentLocationHash;
		}
	}
	
	// Save a list to local storage
	// ul can be a DOM element or an id
	function archiveList(ul) {
		if(!ul || typeof localStorage == 'undefined' || settings.localstorage == 'ignore' || settings.localstorage == false) {
			return;
		}
		
		var $ul = typeof ul == 'string' ? $('#'+ul) : $(ul);
		// Check to see if the tab has localstorage turned off locally (at the tab level)
		if($ul.data('ztabid')) {
			var tabId = $ul.data('ztabid').split('_content')[0];
			if ($('[data-ztabid='+tabId+']').data('localstorage') == false) {
				return;
			}
		}
		
		// build an array of items/tabs in this list
		var listItems = $ul.find('li').not('.overflowTab').map(function() {
			var $t = $(this);
			return {id: this.id, 'theclass': $t.attr('class'), data:$t.data() };
		}).get();
		// store the array	
		localStorage.setItem($ul.attr('id'), JSON.stringify(listItems));
	}

	// Reconstitute a list based on what's in local storage
	// ul can be a DOM element of an id
	function rebuildList(ul) {
		var ul = ul || false;
		var dfd = $.Deferred();		
		
		if(!ul || typeof localStorage == 'undefined' || settings.localstorage == 'ignore' || settings.localstorage == false) {
			dfd.resolve();
			return dfd.promise();
		} else if(typeof ul == 'string') {
			ul = $('#'+ul).get(0);
		}

		var tabsToAdd = [];
		if(localStorage.getItem($(ul).attr('id')) != null) {		
			var tabIds = JSON.parse(localStorage.getItem($(ul).attr('id')));
			for(i in tabIds) {	
				if(tabIds.hasOwnProperty(i)) {
					if(!$(cleanId(tabIds[i].id)).is('li')) {
						// the tab doesn't exist.  It should be added back in
						if(tabIds[i].theclass == 'current' || tabIds[i].theclass == 'currentWithSecondRow' || tabIds[i].theclass == 'currentWithProgression' || tabIds[i].theclass == 'hiddenTab current' || tabIds[i].theclass == 'hiddenTab currentWithSecondRow' || tabIds[i].theclass == 'hiddenTab currentWithProgression') {
							tabIds[i].data.show = true;
						} else {
							tabIds[i].data.show = false;
						}
						tabIds[i].data.tabid = tabIds[i].id;
						tabIds[i].data.position = i;
						tabsToAdd.push({ul:ul, data: tabIds[i].data});
					} else {
						// the tab does exist, should it be current?
					
						if(tabIds[i].theclass == 'current' || tabIds[i].theclass == 'currentWithSecondRow'  || tabIds[i].theclass == 'currentWithProgression' || tabIds[i].theclass == 'hiddenTab current' || tabIds[i].theclass == 'hiddenTab currentWithSecondRow' || tabIds[i].theclass == 'hiddenTab currentWithProgression') {
							var showLater = cleanId(tabIds[i].id);
						}
					}
				}
			}
		}
		
		// We only want to resolve when all the tabs are setup
		$.when(addTabArray(tabsToAdd)).then(function() {
			if(typeof showLater != 'undefined') {
				$.when($(showLater).zTabs('show')).then(function() {
					tabOverflow($(ul));
					dfd.resolve();
				}).fail(function() {
					dfd.reject();
				});
			} else {
				tabOverflow($(ul));
				dfd.resolve();
			}
		});
		return dfd.promise();
	}
	
	// Adds tabs recursively for rebuildList
	function addTabArray(tabsToAdd) {
		var tabsToAdd = tabsToAdd || [];
		var dfd = $.Deferred();
		
		if(tabsToAdd.length < 1) {
			dfd.resolve();
		} else {
			var tab = tabsToAdd.shift();
			
			$.when($(tab.ul).zTabs('add', tab.data), addTabArray(tabsToAdd)).then(function() {
				dfd.resolve();
			}).fail(function() {
				dfd.reject();
			});
		}
		return dfd.promise();
	}
	
	function rebuildAll() {
		// find all the ztab uls and rebuild them
		$('ul.zTabs').each(function() {
			rebuildList(this);
		});
	}
	
	function tabOverflowAll() {
		// find all the ztab uls and rebuild them
		$('ul.zTabs').each(function() {
			tabOverflow($(this));
		});
	}

	// Check to see if the tabs in a given ul are overflowing
	function tabOverflow($ul) {
		
		if(settings.taboverflow == false) {
			return;
		}
		// alert('tabOverflow');
		
		// find all the tabs that are going to be in the overflow, if any
		var overflowTabs = [];
		var currTab = '';		
		
		var ulWidth = $ul.width();
		
		var liWidth = 0;
		// IE7 will expand the height to avoid an overflow
		var heights = $ul.find('li').not('.overflowTab').map(function() {
			liWidth = liWidth + $(this).width();
			return $(this).height();
		});
		
		var ieHeightProblem = false;
		if($.browser.msie) {
			if(heights.length > 0) {
				// compare heights
				var totalHeight = 0;
				for(var i=0; i<heights.length; i++) {
					totalHeight = totalHeight + heights[i];
				}
				var avgHeight = totalHeight/heights.length;
			
				for(var i=0; i<heights.length; i++) {
					if(heights[i] > avgHeight) {
						ieHeightProblem = true;
					}
				}
			} else {
				return;
			}
		}
		
		$ul.find('li').removeClass('hiddenTab');
		if(liWidth > ulWidth || ieHeightProblem) {
			var total = 172; // the overflow tab width
			overflowTabs = $ul.find('li').not('.overflowTab').filter(function(){
				total = total + $(this).width();
				return total > ulWidth || $(this).height() > 1.1 * avgHeight
			}).addClass('hiddenTab').map(function(){ return this.id }).get();
			currTab = $ul.find('.current, .currentWithSecondRow, .currentWithProgression').attr('id');
		}
		
		// remove existing overflow, if any
		$ul.find('.overflowTab').remove();
		// If there are overflow tabs finish up the html and put it out there
		if(overflowTabs.length) {
			var html = '';
			while(overflowTabs.length) {
				var id = overflowTabs.shift();
				var selected = id == currTab ? ' selected' : '';
				html += '<option'+selected+' value="'+id+'">'+$('#'+id).data('label')+'</option>';
			}
			// set up the overflow tab
			$('<li id="'+$ul.attr('id')+'_overflowTab" class="overflowTab"><span><select>'+html+'</select></span></li>').appendTo($ul)
				.find('select').on({
					click:function(e){ e.stopPropagation(); },
					change:function() {
						var $that = $(this), tabId = '#'+$that.val();
						$.when($(tabId).zTabs('show')).then(function() {
							syncOverflow($that.parent().parent());
						});
					}
				});
		}
		syncOverflow($('#'+$ul.attr('id')+'_overflowTab'));
	}
	
	$('.overflowTab:not(.overflowTab img)').live('click', function(event) {
		if(event.target.nodeName == 'IMG' || event.target.nodeName == 'SELECT') {
			// These are not the driods you're looking for
			return;
		}

		$('#'+$(this).find('select').val()).zTabs('show');
	});

	
	
	// Sync up the overflow tab with the info from the tab is currently is representing
	// Send it the overflow tab
	function syncOverflow($overflowTab) {
		var tabId = '#'+$overflowTab.find('select').val(), 
			$tabId = $(tabId), 
			tdata = $tabId.data() || {};
		
		$overflowTab
			.toggleClass('overflowCurrent',$tabId.is('.current'))
			.toggleClass('overflowCurrentWithSecondRow',$tabId.is('.currentWithSecondRow'))
			.find('a').remove(); // remove any lingering button

		if(tdata.refreshable) {
			$overflowTab.find('span').addClass('closeTabText');
			$overflowTab.prepend('<a href="#" onclick="$(\''+tabId+'\').zTabs(\'refresh\');return false;" class="refreshTabButton">'+refreshbutton+'</a> ');
		}
		
		if(tdata.closeable) {
			$overflowTab.find('span').addClass('closeTabText');
			$overflowTab.prepend('<a href="#" onclick="$(\''+tabId+'\').zTabs(\'close\');return false;" class="closeTabButton">'+closebutton+'</a> ');
		} 
		
		if (!tdata.refreshable && !tdata.closeable) {
			$overflowTab.find('span').removeClass('closeTabText');
		}
		
	}	
	
	function rowChange() {
		if(typeof settings.rowchange == 'function') {
			settings.rowchange();
		}
	}
	
	function initialized() {
		if(typeof settings.initialized == 'function') {
			settings.initialized();
		}
		// For the ready function
		readyDfd.resolve();
	}

	// Send this the label of your tab and it will return an id for it.
	// The id is guaranteed to be unique in the current DOM and, in most cases
	// it will be consistent every time.  (conflicts in the DOM undermine consistency)
	function uniqueId(label) {
		var label = label || false;
		if(typeof label != 'string') {
			var now = new Date();
			label = now.getTime();
		}		
		var newId = 'z_'+label.replace(/[^0-9a-z]/gi,'_');
		if($('#'+newId).length > 0) {
			newId = uniqueId(newId);
		}
		return newId;
	}
	
	// ID's need to have certain charaters escaped :.|[] for jQuery selectors to work
	function cleanId(suspectId) {
		return suspectId ? '#' + suspectId.replace(/(:|\.|\[|\])/g,'\\$1') : false;
	 }
	
	// STEVE isn't there a better way to do this.  Recursion to the rescue?
	// CARL: what? no. why is this even happening?
	function whichRow(ul) {
		// return the row number that this ul has
		for(var i=0; i<256; i++) {
			if($(ul).hasClass('row'+i)) {
				return Number(i);
			}
		}
	}
})( jQuery );